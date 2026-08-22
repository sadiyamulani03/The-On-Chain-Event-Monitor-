const { NextResponse } = require("next/server")

exports.GET = async (request) => {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get("address") || ""

  if (!address) {
    return NextResponse.json({ error: "Address required" }, { status: 400 })
  }

  try {
    const { ethers } = require("ethers")
    const RPC_URL = "https://eth.llamarpc.com"
    const provider = new ethers.JsonRpcProvider(RPC_URL)

    let lastBlock = await provider.getBlockNumber()

    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          const currentBlock = await provider.getBlockNumber()
          if (currentBlock > lastBlock) {
            const logs = await provider.getLogs({
              address,
              fromBlock: lastBlock + 1,
              toBlock: "latest",
            })

            for (const log of logs) {
              const event = {
                event: "Transfer",
                args: {},
                txHash: log.transactionHash,
                blockNumber: log.blockNumber,
                address: log.address,
              }
              controller.enqueue(JSON.stringify(event) + "\n")
            }
            lastBlock = currentBlock
          }
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      },
    })

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    return NextResponse.json({ error: "Monitoring failed" }, { status: 500 })
  }
}
