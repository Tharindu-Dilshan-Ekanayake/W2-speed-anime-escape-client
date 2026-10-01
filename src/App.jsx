import GameScene from './game/GameScene'
import useGameSystems from './game/useGameSystems'
import HUD from './ui/HUD'
import LoadingScreen from './ui/LoadingScreen'
import Modals from './ui/Modals'
import TouchControls from './ui/TouchControls'

function App() {
  useGameSystems()
  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: '#0b1630' }}>
      <GameScene />
      <TouchControls />
      <HUD />
      <Modals />
      <LoadingScreen />
    </div>
  )
}

export default App
