import { RpcRequest, RpcRequestPreinit, RpcResponse } from "npm:@hazae41/jsonrpc@1.0.5";
import { NetworkMixin, base16_decode_mixed, base16_encode_lower, initBundledOnce } from "npm:@hazae41/network-bundle@1.2.1";

await initBundledOnce()

while (true) {
  const session = crypto.randomUUID()

  const requestOrThrow = async <T>(preinit: RpcRequestPreinit<unknown>) => {
    const { method, params } = preinit

    const headers = { "Content-Type": "application/json" }
    const body = JSON.stringify(new RpcRequest(0, method, params))
    const response = await fetch(`http://localhost:8080/?session=${session}`, { method: "POST", headers, body })
    return RpcResponse.from<T>(await response.json())
  }

  let balanceBigInt = 0n

  const net_tip = async () => {
    const {
      chainIdString,
      contractZeroHex,
      receiverZeroHex,
      nonceZeroHex,
      minimumZeroHex
    } = await requestOrThrow<{
      chainIdString: string,
      contractZeroHex: string,
      receiverZeroHex: string,
      nonceZeroHex: string,
      minimumZeroHex: string
    }>({
      method: "net_get"
    }).then(r => r.unwrap())

    // const minimumBigInt = BigInt(minimumZeroHex)

    // if (minimumBigInt > (2n ** 20n))
    //   throw new Error("Minimum too high")

    const chainIdBase16 = Number(chainIdString).toString(16).padStart(64, "0")
    const chainIdMemory = base16_decode_mixed(chainIdBase16)

    const contractBase16 = contractZeroHex.slice(2).padStart(64, "0")
    const contractMemory = base16_decode_mixed(contractBase16)

    const receiverBase16 = receiverZeroHex.slice(2).padStart(64, "0")
    const receiverMemory = base16_decode_mixed(receiverBase16)

    const nonceBase16 = nonceZeroHex.slice(2).padStart(64, "0")
    const nonceMemory = base16_decode_mixed(nonceBase16)

    const mixinStruct = new NetworkMixin(chainIdMemory, contractMemory, receiverMemory, nonceMemory)

    const minimumBase16 = minimumZeroHex.slice(2).padStart(64, "0")
    const minimumMemory = base16_decode_mixed(minimumBase16)

    const generatedStruct = mixinStruct.generate(minimumMemory)

    const secretMemory = generatedStruct.to_secret()
    const secretBase16 = base16_encode_lower(secretMemory)
    const secretZeroHex = `0x${secretBase16}`

    balanceBigInt += await requestOrThrow<string>({ method: "net_tip", params: [secretZeroHex] }).then(r => BigInt(r.unwrap()))
  }

  const {
    minimumZeroHex
  } = await requestOrThrow<{
    minimumZeroHex: string
  }>({
    method: "faucet_get"
  }).then(r => r.unwrap())

  const minimumBigInt = BigInt(minimumZeroHex)

  while (balanceBigInt < minimumBigInt)
    await net_tip()

  console.log(await requestOrThrow<unknown>({ method: "faucet_buy", params: ["0xFF4BdfEbbf877627E02515B60B709F3Faf899884"] }))

  balanceBigInt = 0n
}