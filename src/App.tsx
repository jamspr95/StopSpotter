import { Route, Routes } from 'react-router-dom'
import { AdminLayout } from './screens/admin/AdminLayout'
import { AdminLoginScreen } from './screens/admin/AdminLoginScreen'
import { AdminModerationScreen } from './screens/admin/AdminModerationScreen'
import { AdminReportsScreen } from './screens/admin/AdminReportsScreen'
import { AdminStopDetailScreen } from './screens/admin/AdminStopDetailScreen'
import { AdminStopsScreen } from './screens/admin/AdminStopsScreen'
import { DoneShareScreen } from './screens/DoneShareScreen'
import { DropPinScreen } from './screens/DropPinScreen'
import { MapScreen } from './screens/MapScreen'
import { MyStopsScreen } from './screens/MyStopsScreen'
import { NominationFormScreen } from './screens/NominationFormScreen'
import { SignUpScreen } from './screens/SignUpScreen'
import { StopCardScreen } from './screens/StopCardScreen'
import { SupportScreen } from './screens/SupportScreen'
import { VoteScreen } from './screens/VoteScreen'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<MapScreen />} />
      <Route path="/stop/:id" element={<StopCardScreen />} />
      <Route path="/spot" element={<DropPinScreen />} />
      <Route path="/spot/form" element={<NominationFormScreen />} />
      <Route path="/spot/signup" element={<SignUpScreen />} />
      <Route path="/vote" element={<VoteScreen />} />
      <Route path="/done" element={<DoneShareScreen />} />
      <Route path="/my-stops" element={<MyStopsScreen />} />
      <Route path="/support" element={<SupportScreen />} />

      <Route path="/admin/login" element={<AdminLoginScreen />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminStopsScreen />} />
        <Route path="stop/:id" element={<AdminStopDetailScreen />} />
        <Route path="moderation" element={<AdminModerationScreen />} />
        <Route path="reports" element={<AdminReportsScreen />} />
      </Route>
    </Routes>
  )
}
