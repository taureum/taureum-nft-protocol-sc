const Web3 = require('web3')
const provider = new Web3.providers.HttpProvider('https://data-seed-prebsc-1-s1.binance.org:8545')
const web3 = new Web3(provider)

const {makeOrder, hashOrder, signOrder} = require('./utils/order')
const {mintNFT, setApprovalForAll, nftContractAddress} = require('./utils/nft')
const {getProxies} = require('./utils/proxy')

const {walletAddress, sellerPrivateKey, sellerWalletAddress, buyerPrivateKey, buyerWalletAddress, loadKeys} = require("./utils/utils")
//load keys to web3
loadKeys(web3)

const exchangeABI = require('../../abi/TaureumExchange.json').abi
const exchangeAddress = require('../../config.json').deployed.testnet.TaureumExchange
const exchange = new web3.eth.Contract(exchangeABI, exchangeAddress);

(async () => {
    try {
        /**
         * 1. Mint some token on the NFT contracts.
         * */
        let id = await mintNFT(sellerWalletAddress)
        console.log("nftID", id)

        /**
         * 1.2. Approve the authenticated proxy to spent the NFT (if needed). At this step, caller must ensure that his
         * proxy has been created.
         * */
        let proxyAddress = await getProxies(sellerWalletAddress)
        await setApprovalForAll(sellerWalletAddress, proxyAddress, true)

        /**
         * 2. Prepare the callData for the Sell Order
         * Here, we want to transfer the NFT from the sell.Maker to the buy.Maker. Using the transferForm function with
         * the following signature `transferFrom(address from, address to, uint256 tokenId)`.
         * */
        let callData = web3.eth.abi.encodeFunctionCall({
            name: 'transferFrom',
            type: 'function',
            inputs: [{
                type: 'address',
                name: 'from'
            },{
                type: 'address',
                name: 'to'
            },{
                type: 'uint256',
                name: 'tokenId'
            }]
        }, [sellerWalletAddress, buyerWalletAddress, id])
        console.log("callData", callData)

        /**
         * 3. Create orders
         */
        let sell = makeOrder(exchangeAddress, sellerWalletAddress, '0x0000000000000000000000000000000000000000', '0x1Ad8359dF979371a9F1A305776562597bd0A7Da0', nftContractAddress, 100)
        let buy = makeOrder(exchangeAddress, buyerWalletAddress, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', nftContractAddress)
        sell.side = 1
        sell.calldata = callData
        buy.calldata = callData
        buy.makerRelayerFee = 0

        console.log("buy", buy)
        console.log("sell", sell)

        /**
         * 4. Sign orders off-chain
         */
        buy.sig = await signOrder(buy, buyerPrivateKey);
        console.log('buySig', buy.sig)
        sell.sig = await signOrder(sell, sellerPrivateKey);
        console.log('sellSig', sell.sig)

        /**
         * 5. Do atomic match
         */
        let gasEstimate = 1000000
        gasEstimate = await exchange.methods.atomicMatch_(
            [buy.exchange, buy.maker, buy.taker, buy.feeRecipient, buy.target, buy.staticTarget, buy.paymentToken, sell.exchange, sell.maker, sell.taker, sell.feeRecipient, sell.target, sell.staticTarget, sell.paymentToken],
            [buy.makerRelayerFee, buy.takerRelayerFee, buy.makerProtocolFee, buy.takerProtocolFee, buy.basePrice, buy.extra, buy.listingTime, buy.expirationTime, buy.salt, sell.makerRelayerFee, sell.takerRelayerFee, sell.makerProtocolFee, sell.takerProtocolFee, sell.basePrice, sell.extra, sell.listingTime, sell.expirationTime, sell.salt],
            [buy.feeMethod, buy.side, buy.saleKind, buy.howToCall, sell.feeMethod, sell.side, sell.saleKind, sell.howToCall],
            buy.calldata,
            sell.calldata,
            buy.replacementPattern,
            sell.replacementPattern,
            buy.staticExtradata,
            sell.staticExtradata,
            [buy.sig.v, sell.sig.v],
            [buy.sig.r, buy.sig.s, sell.sig.r, sell.sig.s, '0x0000000000000000000000000000000000000000000000000000000000000000']
        ).estimateGas({ from: buyerWalletAddress, value: sell.basePrice });
        console.log(`estimatedGas for orderMatch: ${gasEstimate}`)

        await exchange.methods.atomicMatch_(
            [buy.exchange, buy.maker, buy.taker, buy.feeRecipient, buy.target, buy.staticTarget, buy.paymentToken, sell.exchange, sell.maker, sell.taker, sell.feeRecipient, sell.target, sell.staticTarget, sell.paymentToken],
            [buy.makerRelayerFee, buy.takerRelayerFee, buy.makerProtocolFee, buy.takerProtocolFee, buy.basePrice, buy.extra, buy.listingTime, buy.expirationTime, buy.salt, sell.makerRelayerFee, sell.takerRelayerFee, sell.makerProtocolFee, sell.takerProtocolFee, sell.basePrice, sell.extra, sell.listingTime, sell.expirationTime, sell.salt],
            [buy.feeMethod, buy.side, buy.saleKind, buy.howToCall, sell.feeMethod, sell.side, sell.saleKind, sell.howToCall],
            buy.calldata,
            sell.calldata,
            buy.replacementPattern,
            sell.replacementPattern,
            buy.staticExtradata,
            sell.staticExtradata,
            [buy.sig.v, sell.sig.v],
            [buy.sig.r, buy.sig.s, sell.sig.r, sell.sig.s, '0x0000000000000000000000000000000000000000000000000000000000000000']
        ).send({
            from: buyerWalletAddress,
            gas: gasEstimate,
            value: sell.basePrice
        }).on('receipt', function(receipt){
            console.log("Orders have been atomic matched!", receipt, receipt.events);
        })

    } catch (e) {
        console.log(e);
    }
})();