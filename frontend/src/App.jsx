import { useState } from 'react'
import LeftPane from './components/LeftPane'
import RightPane from './components/RightPane'
import './App.css'

function App() {
  const [selectedItem, setSelectedItem] = useState(null)

  return (
    <div className="App">
      <header className="App-header">
        <h1>Fullstack Application</h1>
      </header>
      <main className="App-main">
        <div className="App-pane App-pane-left">
          <LeftPane onItemSelect={setSelectedItem} />
        </div>
        <div className="App-pane App-pane-right">
          <RightPane />
        </div>
      </main>
    </div>
  )
}

export default App

