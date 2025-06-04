function App() {
  return (
    <div className="flex flex-col h-screen">
      <header className="bg-blue-600 text-white p-4">
        <h1 className="text-xl font-bold">GPS Lotissement</h1>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="h-full w-full" id="map"></div>
      </main>
      <footer className="bg-gray-800 text-white p-2 text-center">
        © 2023 Lotissement GPS
      </footer>
    </div>
  )
}

export default App
