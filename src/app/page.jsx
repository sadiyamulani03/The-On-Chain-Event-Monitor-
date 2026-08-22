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
  const [address, setAddress] = useState("")
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
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Chain Event Monitor</h1>
        <p style={styles.subtitle}>Real-time ERC-20 Transfer monitoring</p>
      </header>

      <div style={styles.card}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Contract Address</label>
          <div style={styles.inputWrapper}>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              style={styles.input}
              disabled={isMonitoring}
            />
            {isMonitoring && <span style={styles.badge}>LIVE</span>}
          </div>
          {error && <p style={styles.error}>{error}</p>}
        </div>

        <button
          onClick={isMonitoring ? stop : start}
          disabled={!isMonitoring && (!address || address.startsWith("0x0"))}
          style={{
            ...styles.button,
            ...(isMonitoring ? styles.buttonStop : styles.buttonStart),
            ...(!isMonitoring && (!address || address.startsWith("0x0")) ? styles.buttonDisabled : {}),
          }}
        >
          {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
        </button>

        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.statValue}>{events.length}</span>
            <span style={styles.statLabel}>Events</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{lastBlock || "—"}</span>
            <span style={styles.statLabel}>Last Block</span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Transfer Events</h2>
        {isMonitoring && events.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.pulse}></div>
                <p>Waiting for transfers...</p>
              </div>
        )}
        {events.length > 0 && (
          <ul style={styles.list}>
            {events.map((e, i) => (
              <li key={i} style={styles.listItem}>
                <div style={styles.eventRow}>
                  <span style={styles.eventType}>Transfer</span>
                  <span style={styles.block}>#{e.blockNumber}</span>
                </div>
                <div style={styles.addresses}>
                  <span style={styles.from}>{formatAddress(e.args.from)}</span>
                  <span style={styles.arrow}>→</span>
                  <span style={styles.to}>{formatAddress(e.args.to)}</span>
                </div>
                <div style={styles.details}>
                  <span style={styles.value}>{formatWei(e.args.value)} ETH</span>
                  <span style={styles.txHash}>{e.txHash.slice(0, 10)}...</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isMonitoring && events.length === 0 && (
          <div style={styles.emptyState}>
            <p>Enter a contract address and start monitoring</p>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "#0f0f0f",
    color: "#e4e4e7",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    padding: "24px",
    maxWidth: "720px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: "32px",
    paddingTop: "16px",
  },
  title: {
    fontSize: "28px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    background: "linear-gradient(135deg, #fff 0%, #a1a1aa 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#71717a",
    margin: 0,
    fontWeight: 400,
  },
  card: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "16px",
  },
  inputGroup: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 500,
    color: "#a1a1aa",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    background: "#0f0f0f",
    border: "1px solid #27272a",
    borderRadius: "8px",
    color: "#e4e4e7",
    fontSize: "14px",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box",
  },
  badge: {
    position: "absolute",
    right: "12px",
    background: "#22c55e",
    color: "#052e16",
    fontSize: "10px",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "9999px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    animation: "pulse 1.5s infinite",
  },
  error: {
    marginTop: "8px",
    fontSize: "13px",
    color: "#ef4444",
  },
  button: {
    width: "100%",
    padding: "14px 24px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "inherit",
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    marginBottom: "16px",
  },
  buttonStart: {
    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    color: "#fff",
    boxShadow: "0 4px 14px rgba(59, 130, 246, 0.3)",
  },
  buttonStop: {
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    color: "#fff",
    boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
  },
  buttonDisabled: {
    background: "#27272a",
    color: "#71717a",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  stats: {
    display: "flex",
    gap: "24px",
    paddingTop: "16px",
    borderTop: "1px solid #27272a",
  },
  stat: {
    flex: 1,
    textAlign: "center",
  },
  statValue: {
    display: "block",
    fontSize: "24px",
    fontWeight: 700,
    fontFamily: "inherit",
    color: "#fff",
  },
  statLabel: {
    display: "block",
    fontSize: "11px",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginTop: "4px",
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#a1a1aa",
    margin: "0 0 16px 0",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  emptyState: {
    textAlign: "center",
    padding: "48px 16px",
    color: "#71717a",
  },
  pulse: {
    width: "12px",
    height: "12px",
    background: "#3b82f6",
    borderRadius: "50%",
    margin: "0 auto 16px",
    animation: "pulse 1.5s infinite",
  },
  list: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  listItem: {
    background: "#0f0f0f",
    border: "1px solid #27272a",
    borderRadius: "8px",
    padding: "16px",
    transition: "border-color 0.2s, background 0.2s",
  },
  eventRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  eventType: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#3b82f6",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  block: {
    fontSize: "12px",
    color: "#71717a",
    fontFamily: "inherit",
  },
  addresses: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
    flexWrap: "wrap",
  },
  from: {
    fontSize: "13px",
    color: "#e4e4e7",
    fontFamily: "inherit",
  },
  arrow: {
    color: "#71717a",
  },
  to: {
    fontSize: "13px",
    color: "#22c55e",
    fontFamily: "inherit",
  },
  details: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: "8px",
    borderTop: "1px solid #27272a",
  },
  value: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#fff",
    fontFamily: "inherit",
  },
  txHash: {
    fontSize: "11px",
    color: "#71717a",
    fontFamily: "inherit",
  },
}