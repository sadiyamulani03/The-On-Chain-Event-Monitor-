"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ethers } from "ethers"

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const CONFIRMATIONS = 2
const MAX_RANGE = 2000
const STORAGE_KEY = "chain-monitor-last-block"
const DEDUP_KEY = "chain-monitor-seen-logs"

const formatAddress = (addr, chars = 6) => {
  if (!addr) return ""
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`
}

const formatWei = (amount) => {
  if (!amount) return "0"
  return ethers.formatUnits(amount.toString(), 18)
}

const getStoredLastBlock = (address) => {
  if (typeof window === "undefined") return 0
  try {
    const data = localStorage.getItem(`${STORAGE_KEY}-${address.toLowerCase()}`)
    return data ? parseInt(data, 10) : 0
  } catch {
    return 0
  }
}

const setStoredLastBlock = (address, block) => {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(`${STORAGE_KEY}-${address.toLowerCase()}`, block.toString())
  } catch {}
}

const getSeenLogs = () => {
  if (typeof window === "undefined") return new Set()
  try {
    const data = localStorage.getItem(DEDUP_KEY)
    return data ? new Set(JSON.parse(data)) : new Set()
  } catch {
    return new Set()
  }
}

const addSeenLog = (seen, key) => {
  seen.add(key)
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(DEDUP_KEY, JSON.stringify([...seen]))
    } catch {}
  }
}

const TRANSFER_IFACE = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"])

const decodeTransferLog = (log) => {
  try {
    return TRANSFER_IFACE.parseLog({ topics: log.topics, data: log.data })
  } catch {
    return null
  }
}

const fetchLogsWithRetry = async (provider, filter, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await provider.getLogs(filter)
    } catch (e) {
      const msg = e?.message?.toLowerCase() || ""
      const isRangeError = msg.includes("range") || msg.includes("max block") || msg.includes("too large")
      if (isRangeError && filter.fromBlock !== filter.toBlock) {
        const mid = Math.floor((Number(filter.fromBlock) + Number(filter.toBlock)) / 2)
        const left = await fetchLogsWithRetry(provider, { ...filter, toBlock: mid }, retries)
        const right = await fetchLogsWithRetry(provider, { ...filter, fromBlock: mid + 1 }, retries)
        return [...left, ...right]
      }
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  return []
}

export default function Home() {
  const [events, setEvents] = useState([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [address, setAddress] = useState("0x0000000000000000000000000000000000000000")
  const [lastBlock, setLastBlock] = useState(0)
  const [error, setError] = useState(null)
  const seenLogsRef = useRef(new Set())
  const abortRef = useRef(null)

  useEffect(() => {
    seenLogsRef.current = getSeenLogs()
  }, [])

  const monitorEvents = useCallback(async (addr) => {
    const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com")
    let lb = getStoredLastBlock(addr) || (await provider.getBlockNumber())
    setLastBlock(lb)

    abortRef.current = new AbortController()

    while (!abortRef.current.signal.aborted) {
      try {
        const cb = await provider.getBlockNumber()
        const safeHead = cb - CONFIRMATIONS
        if (safeHead > lb) {
          let fromBlock = lb + 1
          while (fromBlock <= safeHead && !abortRef.current.signal.aborted) {
            const toBlock = Math.min(fromBlock + MAX_RANGE - 1, safeHead)
            const logs = await fetchLogsWithRetry(provider, {
              address: addr,
              fromBlock,
              toBlock,
              topics: [TRANSFER_TOPIC],
            })
            for (const log of logs) {
              const dedupKey = `${log.transactionHash}-${log.logIndex}`
              if (seenLogsRef.current.has(dedupKey)) continue
              const parsed = decodeTransferLog(log)
              if (parsed) {
                const ev = {
                  event: "Transfer",
                  args: { from: parsed.args.from, to: parsed.args.to, value: parsed.args.value.toString() },
                  txHash: log.transactionHash,
                  blockNumber: log.blockNumber,
                  logIndex: log.logIndex,
                  address: log.address,
                }
                setEvents((p) => [...p, ev].slice(-50))
                addSeenLog(seenLogsRef.current, dedupKey)
              }
            }
            lb = toBlock
            setLastBlock(lb)
            setStoredLastBlock(addr, lb)
            fromBlock = toBlock + 1
          }
        }
      } catch (e) {
        console.error("Monitor error:", e)
      }
      await new Promise(r => setTimeout(r, 2000))
    }
  }, [])

  const start = async () => {
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      setError("Please enter a valid contract address")
      setTimeout(() => setError(null), 3000)
      return
    }
    setError(null)
    setIsMonitoring(true)
    setEvents([])
    try {
      await monitorEvents(address)
    } catch (e) {
      setError("Monitoring failed. Check address and try again.")
    }
    setIsMonitoring(false)
  }

  const stop = () => {
    abortRef.current?.abort()
    setIsMonitoring(false)
    setError(null)
  }

  useEffect(() => {
    if (isMonitoring) start()
    return () => abortRef.current?.abort()
  }, [isMonitoring, start])

  return (
    <main className="min-h-screen bg-gray-50 p-4 font-system">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17 21v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5l3 3z"/>
                <path d="M3 7v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"/>
                <path d="M12 3v4m0 12v4"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Chain Event Monitor</h1>
              <p className="text-xs text-gray-500">Raw data decoder · RPC subscriptions · No indexer</p>
            </div>
          </div>
        </header>

        <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <h2 className="text-lg font-medium text-gray-700 mb-3">Contract Address</h2>
          <div className="relative">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-3 rounded-lg bg-white border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none text-sm"
              disabled={isMonitoring}
              aria-label="Contract address"
            />
            {isMonitoring && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-500 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Monitoring
              </span>
            )}
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
          )}
        </div>

        <div className="mb-6">
          <button
            onClick={isMonitoring ? stop : start}
            disabled={!isMonitoring && (!address || address.startsWith("0x0"))}
            className={`w-full py-3 rounded-lg font-medium transition-all duration-200 ${
              isMonitoring
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            } ${!isMonitoring && (!address || address.startsWith("0x0")) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span className="flex items-center justify-center gap-2">
              {isMonitoring ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 1 1 0 20" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
            </span>
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-medium text-gray-700">Events</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {isMonitoring && events.length === 0 && (
              <div className="p-6 text-center text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 text-indigo-400 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="9" cy="21" r="1.5" />
                  <circle cx="20" cy="21" r="1.5" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.58" />
                </svg>
                <p className="text-sm">Waiting for events...</p>
              </div>
            )}
            {events.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {events.map((e, i) => (
                  <li key={i} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="w-8 text-indigo-600 text-sm font-medium flex-shrink-0">
                        {e.event}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {formatAddress(e.args.from)} → {formatAddress(e.args.to)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatWei(e.args.value)} ETH · Block {e.blockNumber}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 text-right text-indigo-600 text-xs font-mono">
                      {e.txHash.slice(0, 12)}...
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!isMonitoring && events.length === 0 && (
              <div className="p-6 text-center text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="M22 4L12 4a10 10 0 1 0-3.08 1.54" />
                  <path d="M4.93 4.93L12 12l7.07-7.07" />
                  <path d="M6 12a4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4 4z" />
                  <path d="M16 12a4 4 0 0 0-4 4 4 4 0 0 0 4-4 4 4 0 0 0 4 4z" />
                </svg>
                <p className="text-sm">Enter a contract address and click Start Monitoring</p>
              </div>
            )}
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-400">
          <p>Road to Devcon I • Problem 3 · Chain Event Monitor</p>
        </footer>
      </div>
    </main>
  )
}