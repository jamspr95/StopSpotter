import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { logEvent } from './lib/analytics'
import { AdminGrowthScreen } from './screens/admin/AdminGrowthScreen'
import { AdminLayout } from './screens/admin/AdminLayout'
import { AdminLoginScreen } from './screens/admin/AdminLoginScreen'
import { AdminModerationScreen } from './screens/admin/AdminModerationScreen'
import { AdminReportsScreen } from './screens/admin/AdminReportsScreen'
import { AdminReviewScreen } from './screens/admin/AdminReviewScreen'
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

/** One cookieless pageview event per route change — see src/lib/analytics.ts. */
function PageviewTracker() {
  const location = useLocation()
  useEffect(() => {
    logEvent('pageview', location.pathname)
  }, [location.pathname])
  return null
}

export function App() {
  return (
    <>
      <PageviewTracker />
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
          <Route path="review" element={<AdminReviewScreen />} />
          <Route path="stop/:id" element={<AdminStopDetailScreen />} />
          <Route path="moderation" element={<AdminModerationScreen />} />
          <Route path="growth" element={<AdminGrowthScreen />} />
          <Route path="reports" element={<AdminReportsScreen />} />
        </Route>
      </Routes>
    </>
  )
}
