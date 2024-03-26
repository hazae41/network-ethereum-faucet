// deno-lint-ignore-file no-empty require-await
import * as Dotenv from "https://deno.land/std@0.217.0/dotenv/mod.ts";
import { Address, Keccak256 } from "npm:@hazae41/cubane@0.1.16";
import { Future } from "npm:@hazae41/future@1.0.3";
import { RpcErr, RpcError, RpcInternalError, RpcInvalidParamsError, RpcMethodNotFoundError, RpcOk, RpcRequest, RpcRequestInit } from "npm:@hazae41/jsonrpc@1.0.5";
import { Mutex } from "npm:@hazae41/mutex@1.2.12";
import { Memory, NetworkMixin, base16_decode_mixed, base16_encode_lower, initBundledOnce } from "npm:@hazae41/network-bundle@1.2.1";
import { None, Some } from "npm:@hazae41/option@1.0.27";
import * as Ethers from "npm:ethers";
import FaucetAbi from "./libs/ethers/abis/faucet.abi.json" with { type: "json" };
import NetworkAbi from "./libs/ethers/abis/token.abi.json" with { type: "json" };
import { warn } from "./libs/ethers/mod.ts";
import { NetworkSignaler } from "./libs/network/mod.ts";

Keccak256.set(Keccak256.fromNoble())

export async function main(prefix = "") {
  const envPath = new URL(import.meta.resolve("./.env.local")).pathname

  const {
    NETWORK_PRIVATE_KEY_ZERO_HEX = Deno.env.get(prefix + "NETWORK_PRIVATE_KEY_ZERO_HEX"),

    FAUCET_CHAIN_ID = Deno.env.get(prefix + "FAUCET_CHAIN_ID"),
    FAUCET_CHAIN_URL = Deno.env.get(prefix + "FAUCET_CHAIN_URL"),
    FAUCET_PRIVATE_KEY_ZERO_HEX = Deno.env.get(prefix + "FAUCET_PRIVATE_KEY_ZERO_HEX"),

    SIGNAL_SIGNALED_URL = Deno.env.get(prefix + "SIGNAL_SIGNALED_URL"),
    SIGNAL_SIGNALER_URL_LIST = Deno.env.get(prefix + "SIGNAL_SIGNALER_URL_LIST"),
  } = await Dotenv.load({ envPath, examplePath: null })

  if (NETWORK_PRIVATE_KEY_ZERO_HEX == null)
    throw new Error("NETWORK_PRIVATE_KEY_ZERO_HEX is not set")

  if (FAUCET_CHAIN_ID == null)
    throw new Error("FAUCET_CHAIN_ID is not set")
  if (FAUCET_CHAIN_URL == null)
    throw new Error("FAUCET_CHAIN_URL is not set")
  if (FAUCET_PRIVATE_KEY_ZERO_HEX == null)
    throw new Error("FAUCET_PRIVATE_KEY_ZERO_HEX is not set")

  const networkPrivateKeyZeroHex = NETWORK_PRIVATE_KEY_ZERO_HEX

  const faucetChainId = FAUCET_CHAIN_ID
  const faucetChainUrl = FAUCET_CHAIN_URL
  const faucetPrivateKeyZeroHex = FAUCET_PRIVATE_KEY_ZERO_HEX

  const signalSignaledUrl = SIGNAL_SIGNALED_URL

  const [signalSignalerUrlList = []] = [SIGNAL_SIGNALER_URL_LIST?.split(",")]

  return await serve({ networkPrivateKeyZeroHex, faucetChainId, faucetChainUrl, faucetPrivateKeyZeroHex, signalSignaledUrl, signalSignalerUrlList })
}

export interface ServerParams {
  readonly networkPrivateKeyZeroHex: string,

  readonly faucetChainId: string,
  readonly faucetChainUrl: string,
  readonly faucetPrivateKeyZeroHex: string,

  readonly signalSignaledUrl?: string,
  readonly signalSignalerUrlList: string[],
}

export async function serve(params: ServerParams) {
  const { networkPrivateKeyZeroHex, faucetChainId, faucetChainUrl, faucetPrivateKeyZeroHex, signalSignaledUrl, signalSignalerUrlList } = params

  await initBundledOnce()

  const chainIdString = "100"
  const networkContractZeroHex = "0x0a4d5EFEa910Ea5E39be428A3d57B80BFAbA52f4"
  const faucetContractZeroHex = "0x792417F63D6DA859504ee0630BF14db838918A2E"

  const networkProvider = new Ethers.JsonRpcProvider("https://gnosis-rpc.publicnode.com")
  const networkWallet = new Ethers.Wallet(networkPrivateKeyZeroHex).connect(networkProvider)
  const networkContract = new Ethers.Contract(networkContractZeroHex, NetworkAbi, networkWallet)

  const faucetProvider = new Ethers.JsonRpcProvider(faucetChainUrl)
  const faucetWallet = new Ethers.Wallet(faucetPrivateKeyZeroHex).connect(faucetProvider)
  const faucetContract = new Ethers.Contract(faucetContractZeroHex, FaucetAbi, faucetWallet)

  const chainIdNumber = Number(chainIdString)
  const chainIdBase16 = chainIdNumber.toString(16).padStart(64, "0")
  const chainIdMemory = base16_decode_mixed(chainIdBase16)

  const contractBase16 = networkContractZeroHex.slice(2).padStart(64, "0")
  const contractMemory = base16_decode_mixed(contractBase16)

  const receiverZeroHex = networkWallet.address
  const receiverBase16 = receiverZeroHex.slice(2).padStart(64, "0")
  const receiverMemory = base16_decode_mixed(receiverBase16)

  const nonceBytes = crypto.getRandomValues(new Uint8Array(32))
  const nonceMemory = new Memory(nonceBytes)
  const nonceBase16 = base16_encode_lower(nonceMemory)
  const nonceZeroHex = `0x${nonceBase16}`

  const mixinStruct = new NetworkMixin(chainIdMemory, contractMemory, receiverMemory, nonceMemory)

  const allSecretZeroHexSet = new Set<string>()

  let pendingSecretZeroHexArray = new Array<string>()
  let pendingTotalValueBigInt = 0n

  let pendingReceiverZeroHexArray = new Array<string>()
  let pendingValueZeroHexArray = new Array<string>()

  const networkMutex = new Mutex(undefined)
  const faucetMutex = new Mutex(undefined)

  let networkMinimumBigInt = 2n ** 16n
  let networkMinimumBase16 = networkMinimumBigInt.toString(16).padStart(64, "0")
  let networkMinimumZeroHex = `0x${networkMinimumBase16}`

  let faucetMinimumBigInt = 1n
  let faucetMinimumBase16 = faucetMinimumBigInt.toString(16).padStart(64, "0")
  let faucetMinimumZeroHex = `0x${faucetMinimumBase16}`

  const signal = () => {
    for (const signalerUrl of signalSignalerUrlList) {
      const signaler = new NetworkSignaler(signalerUrl)

      signaler.signal(crypto.randomUUID(), {
        protocols: [`https:json-rpc:net`, `https:json-rpc:faucet:${Number(faucetChainId)}`],
        location: signalSignaledUrl,
        networkMinimum: networkMinimumZeroHex,
        faucetMinimum: faucetMinimumZeroHex
      }).catch(console.warn)
    }
  }

  const claim = async (totalValueBigInt: bigint, secretZeroHexArray: string[]) => {
    const backpressure = networkMutex.locked

    if (backpressure) {
      networkMinimumBigInt = networkMinimumBigInt * 2n
      networkMinimumBase16 = networkMinimumBigInt.toString(16).padStart(64, "0")
      networkMinimumZeroHex = `0x${networkMinimumBase16}`

      console.log(`Increasing minimum to ${networkMinimumBigInt.toString()} wei`)
      signal()
    }

    await networkMutex.lock(async () => {
      if (backpressure) {
        networkMinimumBigInt = networkMinimumBigInt / 2n
        networkMinimumBase16 = networkMinimumBigInt.toString(16).padStart(64, "0")
        networkMinimumZeroHex = `0x${networkMinimumBase16}`

        console.log(`Decreasing minimum to ${networkMinimumBigInt.toString()} wei`)
        signal()
      }

      const nonce = await networkWallet.getNonce("latest")

      while (true) {
        const signal = AbortSignal.timeout(15000)
        const future = new Future<never>()

        const onAbort = () => future.reject(new Error("Aborted"))

        try {
          signal.addEventListener("abort", onAbort, { passive: true })

          console.log(`Claiming ${totalValueBigInt.toString()} wei`)
          const responsePromise = networkContract.claim(nonceZeroHex, secretZeroHexArray, { nonce })
          const response = await Promise.race([responsePromise, future.promise])

          console.log(`Waiting for ${response.hash} on ${response.nonce}`)
          const receipt = await Promise.race([response.wait(), future.promise])

          return receipt
        } catch (e: unknown) {
          if (signal.aborted)
            continue
          throw e
        } finally {
          signal.removeEventListener("abort", onAbort)
        }
      }
    })
  }

  const send = async (receiverZeroHexArray: string[], valueZeroHexArray: string[]) => {
    const backpressure = faucetMutex.locked

    if (backpressure) {
      faucetMinimumBigInt = faucetMinimumBigInt * 2n
      faucetMinimumBase16 = faucetMinimumBigInt.toString(16).padStart(64, "0")
      faucetMinimumZeroHex = `0x${faucetMinimumBase16}`

      console.log(`Increasing faucet minimum to ${faucetMinimumBigInt.toString()} wei`)
      signal()
    }

    await networkMutex.lock(async () => {
      if (backpressure) {
        faucetMinimumBigInt = faucetMinimumBigInt / 2n
        faucetMinimumBase16 = faucetMinimumBigInt.toString(16).padStart(64, "0")
        faucetMinimumZeroHex = `0x${faucetMinimumBase16}`

        console.log(`Decreasing faucet minimum to ${faucetMinimumBigInt.toString()} wei`)
        signal()
      }

      const nonce = await faucetWallet.getNonce("latest")

      while (true) {
        const signal = AbortSignal.timeout(15000)
        const rejectOnAbort = new Future<never>()

        const onAbort = () => rejectOnAbort.reject(new Error("Aborted"))

        try {
          signal.addEventListener("abort", onAbort, { passive: true })

          console.log(`Sending`)
          const responsePromise = faucetContract.send(receiverZeroHexArray, valueZeroHexArray, { nonce })
          const response = await Promise.race([responsePromise, rejectOnAbort.promise])
          const receipt = await Promise.race([response.wait(), rejectOnAbort.promise])

          return receipt
        } catch (e: unknown) {
          if (signal.aborted)
            continue
          throw e
        } finally {
          signal.removeEventListener("abort", onAbort)
        }
      }
    })
  }

  const balanceByUuid = new Map<string, bigint>()

  const onHttpRequest = async (request: Request) => {
    const url = new URL(request.url)

    const session = url.searchParams.get("session")

    if (session == null)
      return new Response("Bad Request", { status: 400 })

    const onRequest = async (request: RpcRequestInit) => {
      try {
        const option = await routeOrNone(request)

        if (option.isNone())
          return option

        return new Some(new RpcOk(request.id, option.get()))
      } catch (e: unknown) {
        return new Some(new RpcErr(request.id, RpcError.rewrap(e)))
      }
    }

    const routeOrNone = async (request: RpcRequestInit) => {
      if (request.method === "net_get")
        return new Some(await onNetGet(request))
      if (request.method === "net_tip")
        return new Some(await onNetTip(request))
      if (request.method === "faucet_get")
        return new Some(await onFaucetGet(request))
      if (request.method === "faucet_buy")
        return new Some(await onFaucetBuy(request))
      return new None()
    }

    const onNetGet = async (_: RpcRequestInit) => {
      return { chainIdString, contractZeroHex: networkContractZeroHex, receiverZeroHex, nonceZeroHex, minimumZeroHex: networkMinimumZeroHex }
    }

    const onNetTip = async (request: RpcRequestInit) => {
      const [secretZeroHex] = request.params as [string]

      if (typeof secretZeroHex !== "string")
        throw new RpcInvalidParamsError()
      if (secretZeroHex.length !== 66)
        throw new RpcInvalidParamsError()
      if (allSecretZeroHexSet.has(secretZeroHex))
        throw new RpcInvalidParamsError()

      allSecretZeroHexSet.add(secretZeroHex)

      const secretBase16 = secretZeroHex.slice(2).padStart(64, "0")
      const secretMemory = base16_decode_mixed(secretBase16)

      const valueMemory = mixinStruct.verify_secret(secretMemory)
      const valueBase16 = base16_encode_lower(valueMemory)
      const valueZeroHex = `0x${valueBase16}`
      const valueBigInt = BigInt(valueZeroHex)

      if (valueBigInt < networkMinimumBigInt)
        throw new RpcInvalidParamsError()

      const addedBigInt = valueBigInt - networkMinimumBigInt

      const [balanceBigInt = 0n] = [balanceByUuid.get(session)]
      balanceByUuid.set(session, balanceBigInt + addedBigInt)

      console.log(`Received ${valueBigInt.toString()} wei`)

      pendingSecretZeroHexArray.push(secretZeroHex)
      pendingTotalValueBigInt += valueBigInt

      if (pendingSecretZeroHexArray.length > 640) {
        claim(pendingTotalValueBigInt, pendingSecretZeroHexArray).catch(warn)

        pendingSecretZeroHexArray = new Array<string>()
        pendingTotalValueBigInt = 0n
      }

      return addedBigInt.toString()
    }

    const onFaucetGet = async (_: RpcRequestInit) => {
      return { minimumZeroHex: faucetMinimumZeroHex }
    }

    const onFaucetBuy = async (request: RpcRequestInit) => {
      const [receiverZeroHex] = request.params as [string]

      if (!Address.is(receiverZeroHex))
        throw new RpcInvalidParamsError()

      const [balanceBigInt = 0n] = [balanceByUuid.get(session)]

      if (balanceBigInt < faucetMinimumBigInt)
        throw new RpcInternalError("Insufficient balance")

      const valueBigInt = balanceBigInt - faucetMinimumBigInt
      const valueBase16 = valueBigInt.toString(16).padStart(64, "0")
      const valueZeroHex = `0x${valueBase16}`

      balanceByUuid.delete(session)

      console.log(`Bought ${valueBigInt.toString()} wei`)

      pendingReceiverZeroHexArray.push(receiverZeroHex)
      pendingValueZeroHexArray.push(valueZeroHex)

      if (pendingReceiverZeroHexArray.length > 10) {
        send(pendingReceiverZeroHexArray, pendingValueZeroHexArray).catch(warn)

        pendingReceiverZeroHexArray = new Array<string>()
        pendingValueZeroHexArray = new Array<string>()
      }

      return valueBigInt.toString()
    }

    const target = faucetChainUrl

    if (target == null)
      return new Response("Bad Gateway", { status: 502 })

    if (request.method !== "POST")
      return new Response("Method Not Allowed", { status: 405 })

    const contentType = request.headers.get("content-type")

    if (contentType !== "application/json")
      return new Response("Unsupported Media Type", { status: 415 })

    const data = RpcRequest.from(await request.json())
    const result = await onRequest(data).then(o => o.unwrapOrElseSync(() => new RpcErr(data.id, new RpcMethodNotFoundError())))

    const headers = { "content-type": "application/json" }
    const body = JSON.stringify(result)

    return new Response(body, { status: 200, headers })
  }

  signal()

  return { onHttpRequest }
}