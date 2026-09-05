"use client";

import { useState, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

export default function BakeryLoyalty() {
  const { ready, authenticated, login, logout, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const [stamps, setStamps] = useState(null);
  const [loadingStamps, setLoadingStamps] = useState(false);
  const [awardLoading, setAwardLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Embedded wallet is auto-created via createOnLogin: 'users-without-wallets'
  const embeddedWallet = wallets?.find((w) => w.walletClientType === "privy");
  const walletAddress = embeddedWallet?.address || wallets?.[0]?.address || null;

  const fetchBalance = useCallback(async () => {
    if (authenticated === false) return;
    setLoadingStamps(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("No access token - please sign in again");
        return;
      }
      const res = await fetch("/api/balance", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch balance");
      }
      const data = await res.json();
      setStamps(data.stamps);
    } catch (e) {
      setError(e.message || "Failed to load stamps");
    } finally {
      setLoadingStamps(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    if (authenticated && ready) {
      fetchBalance();
    } else if (authenticated === false) {
      setStamps(null);
    }
  }, [authenticated, ready, fetchBalance]);

  const handleAwardStamp = async () => {
    setAwardLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Not authenticated - please sign in again");
      }
      const res = await fetch("/api/stamp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Stamp award failed");
      }
      setStamps(data.stamps);
      setSuccess(`Stamp awarded! You now have ${data.stamps} / 10 stamps`);
      if (data.stamps >= 10) {
        setSuccess("🎂 Free cake unlocked! 10/10 stamps!");
      }
    } catch (e) {
      setError(e.message || "Failed to award stamp");
    } finally {
      setAwardLoading(false);
    }
  };

  // 4. Initializing state handled before auth-dependent UI renders
  if (!ready) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.title}>🍞 Ramesh Bakery</h1>
          <p style={styles.loadingText}>Loading loyalty card...</p>
          <div style={styles.spinner} />
        </div>
      </main>
    );
  }

  // 3. Route gating reads Privy's authenticated state
  if (!authenticated) {
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.title}>🍞 Ramesh Bakery</h1>
          <p style={styles.subtitle}>Loyalty stamps you can’t photocopy</p>
          <p style={styles.desc}>
            Sign in with your email — no wallet, no extension, no recovery phrase. Your loyalty card lives safely on-chain.
          </p>
          {/* 1. Sign-in entry point calls a Privy login method */}
          <button onClick={login} style={styles.primaryBtn}>
            Sign in with Email
          </button>
          <p style={styles.hint}>Takes under a minute. Google login also available.</p>
          <div style={styles.footerNote}>
            <small>Powered by embedded wallets — created automatically on first sign-in</small>
          </div>
        </div>
      </main>
    );
  }

  // Authenticated view - user has embedded wallet automatically (via createOnLogin)
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <h1 style={styles.title}>🍞 Ramesh Bakery</h1>
          <button onClick={logout} style={styles.logoutBtn}>
            Sign out
          </button>
        </div>

        <p style={styles.welcome}>Welcome, {user?.email?.address || user?.google?.email || "valued customer"}!</p>

        {walletAddress ? (
          <p style={styles.wallet}>
            Wallet: <code style={styles.code}>{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</code>
          </p>
        ) : (
          <p style={styles.walletPending}>Creating your wallet...</p>
        )}

        <div style={styles.stampCard}>
          <h2 style={styles.stampTitle}>Your Loyalty Card</h2>
          {loadingStamps ? (
            <p>Loading stamps...</p>
          ) : stamps !== null ? (
            <>
              <div style={styles.stampsGrid}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={i < stamps ? styles.stampFilled : styles.stampEmpty}>
                    {i < stamps ? "✓" : i + 1}
                  </div>
                ))}
              </div>
              <p style={styles.balanceText}>
                {stamps} / 10 stamps {stamps >= 10 && "— Free cake! 🎂"}
              </p>
            </>
          ) : (
            <p>Could not load balance.</p>
          )}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <button onClick={handleAwardStamp} disabled={awardLoading} style={awardLoading ? styles.btnDisabled : styles.primaryBtn}>
          {awardLoading ? "Awarding..." : "Staff: Award Stamp"}
        </button>

        <p style={styles.note}>
          Staff button simulates awarding at the counter. Server verifies your identity from your Privy access token — the browser can’t forge it.
        </p>

        <button onClick={fetchBalance} disabled={loadingStamps} style={styles.secondaryBtn}>
          Refresh balance
        </button>

        {error && error.includes("Failed") && (
          <p style={styles.retryHint}>Stamp request failed — please try again.</p>
        )}
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#fef3c7",
    padding: "20px",
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "white",
    padding: "32px",
    borderRadius: "16px",
    maxWidth: "480px",
    width: "100%",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    textAlign: "center",
  },
  title: { fontSize: "28px", marginBottom: "8px" },
  subtitle: { color: "#92400e", fontWeight: "600", marginBottom: "12px" },
  desc: { color: "#57534e", fontSize: "15px", lineHeight: "1.5", marginBottom: "20px" },
  primaryBtn: {
    width: "100%",
    padding: "12px",
    background: "#d97706",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
  },
  btnDisabled: {
    width: "100%",
    padding: "12px",
    background: "#a8a29e",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    cursor: "not-allowed",
  },
  secondaryBtn: {
    marginTop: "12px",
    width: "100%",
    padding: "10px",
    background: "white",
    color: "#d97706",
    border: "1px solid #d97706",
    borderRadius: "8px",
    cursor: "pointer",
  },
  logoutBtn: {
    padding: "6px 12px",
    background: "transparent",
    border: "1px solid #e7e5e4",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
  },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" },
  welcome: { fontSize: "14px", color: "#44403c", marginBottom: "6px" },
  wallet: { fontSize: "13px", color: "#78716c", marginBottom: "16px" },
  walletPending: { fontSize: "13px", color: "#a16207", marginBottom: "16px" },
  code: { background: "#fef3c7", padding: "2px 6px", borderRadius: "4px" },
  stampCard: {
    background: "#fffbeb",
    border: "2px dashed #f59e0b",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "16px",
  },
  stampTitle: { fontSize: "16px", marginBottom: "12px", color: "#92400e" },
  stampsGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "10px" },
  stampFilled: {
    width: "48px",
    height: "48px",
    background: "#d97706",
    color: "white",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    margin: "0 auto",
  },
  stampEmpty: {
    width: "48px",
    height: "48px",
    background: "white",
    border: "2px solid #e7e5e4",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#a8a29e",
    margin: "0 auto",
  },
  balanceText: { fontWeight: "600", color: "#92400e" },
  error: { background: "#fef2f2", color: "#b91c1c", padding: "10px", borderRadius: "8px", marginBottom: "10px", fontSize: "14px" },
  success: { background: "#f0fdf4", color: "#15803d", padding: "10px", borderRadius: "8px", marginBottom: "10px", fontSize: "14px" },
  note: { fontSize: "12px", color: "#78716c", marginTop: "10px" },
  hint: { fontSize: "12px", color: "#a8a29e", marginTop: "10px" },
  footerNote: { marginTop: "14px", color: "#a8a29e", fontSize: "11px" },
  loadingText: { color: "#57534e", marginTop: "12px" },
  spinner: {
    margin: "16px auto",
    width: "24px",
    height: "24px",
    border: "3px solid #fde68a",
    borderTop: "3px solid #d97706",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  retryHint: { fontSize: "12px", color: "#b91c1c", marginTop: "8px" },
};
