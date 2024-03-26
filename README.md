# Ethereum faucet

Free Ethereum faucet using [Network](https://github.com/stars/hazae41/lists/network)

This converts Proof-of-Work into gas on any Ethereum-like chain!

## Getting started

### Hosting

#### Cloud-hosting

You can easily deploy it as a Dockerized web service to cloud-hosting providers such as [render.com](https://render.com).

Prices are ~$5 for the cheapest hosting. Do not use free tiers as they may have high downtimes.

Just fork this repository on your GitHub account and select it on your cloud hosting platform.

<img src="https://github.com/hazae41/network-ws-to-tcp-proxy/assets/4405263/57eb5e56-7475-4bbf-9ba0-548f1444d6ff" width="500" />

Then setup environment variables (see list below)

<img src="https://github.com/hazae41/network-ws-to-tcp-proxy/assets/4405263/19c3c3a4-7833-4bf5-bd6c-3dac1e7f6e49" width="500" />

#### Self-hosting

You just need 
- Docker (e.g. for [Ubuntu](https://docs.docker.com/engine/install/ubuntu/))
- Make (e.g. `sudo apt-get install make`)
- Git (e.g. `sudo apt-get install git`)

Then clone the repository (or fork-then-clone)

```bash
git clone https://github.com/hazae41/network-json-rpc-guard && cd ./network-json-rpc-guard
```

Setup environment variables (see list below) by creating a `.env.local` file

```bash
cp ./.env.example ./.env.local && nano ./.env.local
```

You can then: 

- Build the latest commit and latest environment variables

```bash
make build
```

- Start and open console (kill with ctrl+c; close with ctrl+p then ctrl+q)

```bash
make start
```

- Show logs

```bash
make logs
```

- Open console (kill with ctrl+c; close with ctrl+p then ctrl+q)

```bash
make open
```

- Stop all instances

```bash
make stop
```

- Clean all builds

```bash
make clean
```

- Update to latest version

```bash
git reset --hard && git checkout $(git tag | sort -V | tail -1) 
```

You can enable HTTPS by either using Cloudflare as a HTTPS-to-HTTP reverse proxy, by configuring Nginx as a HTTPS-to-HTTP reverse proxy on your node, or by setting `CERT` and `KEY`.

### Environment variables

#### `PORT` (default to 8080)

**Don't set if cloud-hosting**

The exposed port

e.g. `8080`

#### `CERT` and `KEY` (optional)

**Don't set if cloud-hosting**

The paths to your TLS certificate and private key

e.g. `./tls/fullchain.pem` and `./tls/privkey.pem`

#### `NETWORK_PRIVATE_KEY_ZERO_HEX` (required)

Your Ethereum private key as a 0x-prefixed base16 string.

Used to claim Network secrets and get Network tokens.

This account must have some xDAI (gas on Gnosis chain).

e.g. `0x35609a4c7e0334d76e15d107c52ee4e9beab1199556cef78fd8624351c0e2c8c`

#### `FAUCET_CHAIN_ID` (required)

The chain ID you want to setup your faucet on.

e.g. `100` for Gnosis

#### `FAUCET_CHAIN_URL` (required)

The HTTP URL to an RPC of the chain you want to setup your faucet on.

e.g. `https://gnosis-rpc.publicnode.com` for Gnosis

#### `FAUCET_CONTRACT_ZERO_HEX` (required)

The faucet contract as a 0x-prefixed base16 string.

It must be deployed on the chain you want to setup your faucet on.

https://gnosisscan.io/address/0xd690625167fF08691D68187Ec542A38ffD416acD#code

Just copy the code and deploy it on the chain you want.

e.g. `0xd690625167fF08691D68187Ec542A38ffD416acD` for Gnosis

#### `FAUCET_PRIVATE_KEY_ZERO_HEX` (required)

Your Ethereum private key as a 0x-prefixed base16 string.

This account must have some gas on the chain you want to setup your faucet on.

It SHOULD be different from the one used to claim Network secrets if you use Gnosis.

e.g. `0x35609a4c7e0334d76e15d107c52ee4e9beab1199556cef78fd8624351c0e2c8c`

#### `SIGNAL_SIGNALER_URL_LIST` (recommended)

A comma-separated list of signaler url in order to publish your node there and be on the market

This is usually a `wss:` url

e.g. `wss://signal.node0.hazae41.me`

#### `SIGNAL_SIGNALED_URL` (recommended)

The public url for contacting your node over HTTP(S)

e.g. `https://faucet.example.com` or `https://something.onrender.com`

## Protocol

### HTTP

Connect to the proxy via HTTP with the following URL query parametes
- `session` -> A unique private random unguessable string for your session (e.g. `crypto.randomUUID()`)

e.g. `https://rpc.example.com/?session=22deac58-7e01-4ddb-b9c4-07c73a32d1b5`

### Price

The price is 1 wei = 1 char of communication (`balance -= message.length`)
- Your balance is withdrawn when you send messages to the JSON-RPC target
- Your balance is withdrawn when the JSON-RPC target sends you messages

**You MUST PAY BEFORE talking with the JSON-RPC target**

All connections are closed (ws) or errored (http) when your balance is negative

So you must count how many bytes you sent/received and pay when your balance is low

### JSON-RPC

The proxy accepts the following JSON-RPC methods

All unknown methods will be forwarded to the target

#### net_get

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  method: "net_get"
}
```

Returns the Network parameters as `{ chainIdString, contractZeroHex, receiverZeroHex, nonceZeroHex, minimumZeroHex }`

#### net_tip

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  method: "net_tip",
  params: [string]
}
```

Params contains a Network secret as a 0x-prefixed base16 string of length 64

e.g.

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  method: "net_tip",
  params: ["0xe353e28d6b6a21a8188ef68643e4b93d41bca5baa853965a6a0c9ab7427138b0"]
}
```

It will return the value added to your balance as a decimal bigint string

```tsx
{
  jsonrpc: "2.0",
  id: 123,
  result: "123456789123456789"
}
```
