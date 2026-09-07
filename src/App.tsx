import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ProfileSetup } from './features/profile/ProfileSetup';
import { ChatList } from './features/chat/ChatList';
import { ChatWindow } from './features/chat/ChatWindow';
import { GroupList } from './features/groups/GroupList';
import { GroupChat } from './features/groups/GroupChat';
import { JoinGroupPage } from './features/groups/JoinGroupPage';
import { CommunityDetail } from './features/communities/CommunityDetail';
import { JoinCommunityPage } from './features/communities/JoinCommunityPage';
import { MeetingsPage } from './features/meetings/MeetingsPage';
import { MeetingLobby } from './features/meetings/MeetingLobby';
import { MeetingRoom } from './features/meetings/MeetingRoom';
import { CallScreen } from './features/calls/CallScreen';
import { CallHistoryPage } from './features/history/CallHistoryPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { SpotPage } from './features/spot/SpotPage';
import { GlobalSearchPage } from './features/search/GlobalSearchPage';
import { FileHubPage } from './features/files/FileHubPage';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/setup-profile" element={<ProfileSetup />} />

              {/* Full-screen routes (no sidebar/bottom nav) */}
              <Route
                path="/meeting/:meetingCode/lobby"
                element={
                  <ProtectedRoute>
                    <MeetingLobby />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/meeting/:meetingCode/room"
                element={
                  <ProtectedRoute>
                    <MeetingRoom />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/call/:callId"
                element={
                  <ProtectedRoute>
                    <CallScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/join-group/:inviteCode"
                element={
                  <ProtectedRoute>
                    <JoinGroupPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/join-community/:inviteCode"
                element={
                  <ProtectedRoute>
                    <JoinCommunityPage />
                  </ProtectedRoute>
                }
              />

              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<ChatList />} />
                <Route path="/chat/:chatId" element={<ChatWindow />} />
                <Route path="/groups" element={<GroupList />} />
                <Route path="/groups/:groupId" element={<GroupChat />} />
                <Route path="/communities/:communityId" element={<CommunityDetail />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/calls" element={<CallHistoryPage />} />
                <Route path="/spot" element={<SpotPage />} />
                <Route path="/search" element={<GlobalSearchPage />} />
                <Route path="/files/:scope/:id" element={<FileHubPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
