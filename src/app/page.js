"use client"

const { useState, useEffect } = require("react")
const { ethers } = require("ethers")

const formatAddress = (addr, chars = 6) => {
  if (!addr) return ""
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

const formatWei = (amount) => {
  if (!amount) return "0"
  return ethers.formatUnits(amount.toString(), 18)
}

export default function Home() {
  const [events, setEvents] = useState([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [address, setAddress] = useState("0x0000000000000000000000000000000000000000")
  const [lastBlock, setLastBlock] = useState(0)

  const monitorEvents = async (addr) => {
    const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com")
    let lb = await provider.getBlockNumber()

    return async function* () {
      while (true) {
        const cb = await provider.getBlockNumber()
        if (cb > lb) {
          const logs = await provider.getLogs({
            address: addr,
            fromBlock: lb + 1,
            toBlock: "latest",
          })
          for (const log of logs) {
            yield {
              event: "Transfer",
              args: {},
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              address: log.address,
            }
          }
          lb = cb
        }
        await new Promise(r => setTimeout(r, 2000))
      }
    }()
  }

  const start = async () => {
    if (!address || address === "0x0000000000000000000000000000000000000000") return
    setIsMonitoring(true)
    setEvents([])
    try {
      for await (const ev of monitorEvents(address)) {
        setEvents((p) => [...p, ev].slice(-50))
      }
    } catch (e) {}
    setIsMonitoring(false)
  }

  useEffect(() => {
    if (isMonitoring) start()
  }, [isMonitoring])

  return (
    <main className="min-h-screen bg-white p-8 font-family-system">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8 border-b border-gray-200 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Chain Event Monitor
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Raw data decoder · RPC subscriptions · No indexer
          </p>
        </header>

        <div className="bg-gray-50 rounded-xl p-6 mb-8 border border-gray-200">
          <h2 className="text-xl font-medium text-gray-700 mb-3">📜 Contract Address</h2>
          <div className="relative">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              className="w-full p-3 rounded-lg bg-white border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
              disabled={isMonitoring}
              aria-label="Contract address"
            />
            {isMonitoring && (
              <span className="absolute right-2 text-xs text-red-500">
                ⚠️
              </span>
            )}
          </div>
        </div>

        <div className="mb-6">
          <button
            onClick={() => setIsMonitoring(true)}
            disabled={isMonitoring || !address || address.startsWith("0x0")}
            className="w-full py-3 rounded-lg font-medium transition-colors ${
              isMonitoring ? "bg-red-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-600"
            } ${
              isMonitoring ? "disabled:opacity-50 cursor-not-allowed" : "cursor-pointer"
            }"
          >
            {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
          </button>
        </div>

        {isMonitoring && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {events.length === 0 && (
              <div className="min-h-[120px] flex items-center justify-center text-gray-400 text-sm">
                Waiting for events...
              </div>
            )}
            {events.map((e, i) => (
              <div
                key={i}
                className="px-3 py-2 rounded-sm bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <span className="w-8 text-indigo-600 text-sm">
                    {e.event}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {formatAddress(e.args.from)} → {formatAddress(e.args.to)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatWei(e.args.value)} ETH · Block {e.blockNumber}
                    </p>
                  </div>
                </div>
                <div className="mt-1 text-right text-indigo-600 text-xs">
                  {e.txHash.slice(0, 10)}...
                </div>
              </div>
            ))}
          </div>
        )}

        {!isMonitoring && (
          <div className="mt-8 text-center text-gray-500 text-sm">
            <svg
              className="mx-auto mb-3 w-10 h-10 opacity-50"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4L12 4a10 10 0 1 0-3.08 1.54" />
              <path d="M4.93 4.93L12 12l7.07-7.07" />
              <path d="M6 12a4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4 4z" />
              <path d="M16 12a4 4 0 0 0-4 4 4 4 0 0 0 4-4 4 4 0 0 0 4 4z" />
            </svg>
            <p>Enter a contract address and click Start Monitoring</p>
          </div>
        )}
      </div>
    </main>
  )
}
