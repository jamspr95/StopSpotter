import { Route, Routes } from 'react-router-dom'
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
    </Routes>
  )
}
