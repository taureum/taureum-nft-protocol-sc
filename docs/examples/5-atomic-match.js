const Web3 = require('web3')
const provider = new Web3.providers.HttpProvider('https://data-seed-prebsc-1-s1.binance.org:8545')
const web3 = new Web3(provider)
const {exchange, keys, exchangeAddress, ERC721ContractAddress} = require("./utils/config");
const {makeOrder, signOrder} = require('./utils/order');
const {ERC721_mint, ERC721_setApprovalForAll} = require('./utils/ERC721/nft');
const {getProxies} = require('./utils/proxy');

(async () => {
    try {
        /**
         * 1. Mint some token on the NFT contracts.
         * */
        let id = await ERC721_mint(keys.sellerWalletAddress)
        console.log("nftID", id)

        /**
         * 1.2. Approve the authenticated proxy to spent the NFT (if needed). At this step, caller must ensure that his
         * proxy has been created.
         * */
        let proxyAddress = await getProxies(keys.sellerWalletAddress)
        await ERC721_setApprovalForAll(keys.sellerWalletAddress, proxyAddress, true)

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
        }, [keys.sellerWalletAddress, keys.buyerWalletAddress, id])
        console.log("callData", callData)

        /**
         * 3. Create orders
         */
        let sell = makeOrder(exchangeAddress, keys.sellerWalletAddress, '0x0000000000000000000000000000000000000000', '0x1Ad8359dF979371a9F1A305776562597bd0A7Da0', ERC721ContractAddress, 100)
        let buy = makeOrder(exchangeAddress, keys.buyerWalletAddress, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', ERC721ContractAddress)
        sell.side = 1
        sell.calldata = callData
        buy.calldata = callData
        buy.makerRelayerFee = 0

        console.log("buy", buy)
        console.log("sell", sell)

        /**
         * 4. Sign orders off-chain
         */
        buy.sig = await signOrder(buy, keys.buyerPrivateKey);
        console.log('buySig', buy.sig)
        sell.sig = await signOrder(sell, keys.sellerPrivateKey);
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
        ).estimateGas({ from: keys.buyerWalletAddress, value: sell.basePrice });
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
            from: keys.buyerWalletAddress,
            gas: gasEstimate,
            value: sell.basePrice
        }).on('receipt', function(receipt){
            console.log("Orders have been atomic matched!", receipt, receipt.events);
        })

    } catch (e) {
        console.log(e);
    }
})();