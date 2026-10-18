import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Film, FileText } from 'lucide-react';
import { db } from '../../firebase/firebaseConfig';
import type { MessageAttachment } from '../chat/chatTypes';

type Tab = 'photos' | 'videos' | 'documents' | 'links';

interface FileEntry {
  id: string;
  attachment: MessageAttachment;
  createdAt: number;
  text: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function FileHubPage() {
  const { scope, id } = useParams<{ scope: 'chats' | 'groups'; id: string }>();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [links, setLinks] = useState<Array<{ id: string; url: string; text: string; createdAt: number }>>([]);
  const [tab, setTab] = useState<Tab>('photos');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!scope || !id) return;
    const q = query(collection(db, scope, id, 'messages'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const files: FileEntry[] = [];
      const linkEntries: typeof links = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.attachment) {
          files.push({ id: d.id, attachment: data.attachment, createdAt: data.createdAt?.toMillis?.() ?? 0, text: data.text ?? '' });
        }
        const foundLinks = (data.text ?? '').match(URL_REGEX);
        foundLinks?.forEach((url: string) => linkEntries.push({ id: `${d.id}-${url}`, url, text: data.text, createdAt: data.createdAt?.toMillis?.() ?? 0 }));
      });
      setEntries(files);
      setLinks(linkEntries);
    });
  }, [scope, id]);

  const filteredFiles = entries.filter((e) => {
    const matchesTab =
      tab === 'photos' ? e.attachment.type === 'image' :
      tab === 'videos' ? e.attachment.type === 'video' :
      tab === 'documents' ? e.attachment.type === 'file' : false;
    const matchesSearch = !search || e.attachment.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="rb-page">
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>File Hub</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['photos', 'videos', 'documents', 'links'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? 'rb-btn rb-btn--primary' : 'rb-btn rb-btn--outline'}
            style={{ fontSize: 13, padding: '6px 14px', textTransform: 'capitalize' }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab !== 'links' && (
        <input className="rb-input" placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 16, maxWidth: 320 }} />
      )}

      {tab === 'links' ? (
        <div>
          {links.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No links shared yet.</p>}
          {links.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noreferrer" style={{ display: 'block', padding: '8px 0', borderBottom: '1px solid var(--color-border)', color: 'var(--color-brand-600)', fontSize: 14, wordBreak: 'break-all' }}>
              {l.url}
            </a>
          ))}
        </div>
      ) : tab === 'photos' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {filteredFiles.map((f) => (
            <a key={f.id} href={f.attachment.url} target="_blank" rel="noreferrer">
              <img src={f.attachment.url} alt={f.attachment.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }} />
            </a>
          ))}
          {filteredFiles.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>No photos yet.</p>}
        </div>
      ) : (
        <div>
          {filteredFiles.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Nothing here yet.</p>}
          {filteredFiles.map((f) => (
            <a key={f.id} href={f.attachment.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-border)', color: 'inherit', textDecoration: 'none' }}>
              <span style={{ display: 'flex', color: 'var(--color-brand-600)' }}>{tab === 'videos' ? <Film size={20} strokeWidth={1.75} /> : <FileText size={20} strokeWidth={1.75} />}</span>
              <div>
                <div style={{ fontSize: 14 }}>{f.attachment.name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{new Date(f.createdAt).toLocaleDateString()}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
