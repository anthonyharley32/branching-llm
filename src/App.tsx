import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="flex gap-8">
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="h-24 w-24 hover:scale-110 transition-transform" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="h-24 w-24 hover:scale-110 transition-transform" alt="React logo" />
        </a>
      </div>
      <h1 className="text-4xl font-bold mt-6 text-blue-600 dark:text-blue-400">Vite + React + Tailwind</h1>
      <div className="card mt-8 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <button 
          onClick={() => setCount((count) => count + 1)}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          count is {count}
        </button>
        <p className="mt-4 text-gray-700 dark:text-gray-300">
          Edit <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="mt-8 text-gray-500 dark:text-gray-400">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
