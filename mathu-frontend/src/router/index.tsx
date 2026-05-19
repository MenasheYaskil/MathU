import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../shared/components/ProtectedRoute';
import LoginPage from '../shared/pages/LoginPage';
import TeacherDashboard from '../features/teacher/pages/TeacherDashboard';
import TeacherRaceView from '../features/teacher/pages/TeacherRaceView';
import JoinLobby from '../features/student/pages/JoinLobby';
import RaceTrack from '../features/student/pages/RaceTrack';

export const router = createBrowserRouter([
  { path: '/', element: <LoginPage /> },
  {
    path: '/teacher',
    element: <ProtectedRoute role="TEACHER" />,
    children: [
      { path: 'dashboard', element: <TeacherDashboard /> },
      { path: 'race/:raceId', element: <TeacherRaceView /> },
    ],
  },
  {
    path: '/student',
    element: <ProtectedRoute role="STUDENT" />,
    children: [
      { path: 'join', element: <JoinLobby /> },
      { path: 'race/:raceId', element: <RaceTrack /> },
    ],
  },
]);
