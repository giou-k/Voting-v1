'use strict';

//- Express initialize.
var express = require('express');
var app = express();
var bodyParser = require('body-parser')

//Load View Engine
app.set('view engine', 'pug');

app.use(express.static(__dirname + '/public'));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())


//- Chaincode variable requires.
var util = require("util");
var hfc = require('fabric-client');
var path = require('path');

//- Routes
let carRoute = require('./routes/carsQuery');
app.use('/cars', carRoute);


var optionsInvoke = {
    wallet_path: path.join(__dirname, './creds'),
    user_id: 'PeerAdmin',
    channel_id: 'mychannel',
    chaincode_id: 'fabcar',
    peer_url: 'grpc://localhost:7051',
    event_url: 'grpc://localhost:7053',
    orderer_url: 'grpc://localhost:7050'
};



var targets = [];
var tx_id = null;

//- Cars variables
var external_outpout;


app.get('/cars/:id', function (req, res) {
	// Request id
	var query_id     =   req.params.id;
	// String transform
	var query_string = query_id.toString();
	// Var to store request
	var singleCar;

	Promise.resolve().then(() => {
    	console.log("Make query");
	     var transaction_id = client.newTransactionID();
	     console.log("Assigning transaction_id: ", transaction_id._transaction_id);
	     // queryCar - requires 1 argument, ex: args: ['CAR4'],
	     // queryAllCars - requires no arguments , ex: args: [''],
	    const request = {
	        chaincodeId: options.chaincode_id,
	        txId: transaction_id,
	        fcn: 'queryCar',
	        args: [query_string]
	    };
        return channel.queryByChaincode(request);
    }).then((query_responses) => {
	    console.log("returned from query");
	    if (!query_responses.length) {
	        console.log("No payloads were returned from query");
	    } else {
	        console.log("Query result count = ", query_responses.length)
	    }
	    if (query_responses[0] instanceof Error) {
	        console.error("error from query = ", query_responses[0]);
	    }

	    singleCar = query_responses[0].toString();
	    console.log("Response is ", query_responses[0].toString());

	    res.render('car', { 
		  	title: 'Show single car information', 
		  	car: JSON.parse(singleCar),
		  	carId: query_string });

	}).catch((err) => {
	    console.error("Caught Error", err);
	});
});

app.get('/car/add', function(req, res) {
	res.render('car/add', {
		title: 'Add a new car'
	});
});

app.post('/car/add', function(req, res) {
	var carKey = req.body.carKey;
	var carManufact = req.body.carManufact;
	var carColor = req.body.carColor;
	var carModel = req.body.carModel;

	Promise.resolve().then(() => {
		console.log("###########################################");
		console.log(carKey);
		console.log("###########################################");
	    console.log("Create a client and set the wallet location");
	    client = new hfc();
	    return hfc.newDefaultKeyValueStore({ path: optionsInvoke.wallet_path });
	}).then((wallet) => {
	    console.log("Set wallet path, and associate user ", optionsInvoke.user_id, " with application");
	    client.setStateStore(wallet);
	    return client.getUserContext(optionsInvoke.user_id, true);
	}).then((user) => {
	    console.log("Check user is enrolled, and set a query URL in the network");
	    if (user === undefined || user.isEnrolled() === false) {
	        console.error("User not defined, or not enrolled - error");
	    }
	    channel = client.newChannel(optionsInvoke.channel_id);
	    var peerObj = client.newPeer(optionsInvoke.peer_url);
	    channel.addPeer(peerObj);
	    channel.addOrderer(client.newOrderer(optionsInvoke.orderer_url));
	    targets.push(peerObj);
	    return;
	}).then(() => {
	    tx_id = client.newTransactionID();
	    console.log("Assigning transaction_id: ", tx_id._transaction_id);
	    // createCar - requires 5 args, ex: args: ['CAR11', 'Honda', 'Accord', 'Black', 'Tom'],
	    // changeCarOwner - requires 2 args , ex: args: ['CAR10', 'Barry'],
	    // send proposal to endorser
	    var request = {
	        targets: targets,
	        chaincodeId: optionsInvoke.chaincode_id,
	        fcn: 'createCar',
	        args: [carKey, carManufact, carModel, carColor, 'Kanelloc'],
	        chainId: optionsInvoke.channel_id,
	        txId: tx_id
	    };
	    return channel.sendTransactionProposal(request);
	}).then((results) => {
	    var proposalResponses = results[0];
	    var proposal = results[1];
	    var header = results[2];
	    let isProposalGood = false;
	    if (proposalResponses && proposalResponses[0].response &&
	        proposalResponses[0].response.status === 200) {
	        isProposalGood = true;
	        console.log('transaction proposal was good');
	    } else {
	        console.error('transaction proposal was bad');
	    }
	    if (isProposalGood) {
	        console.log(util.format(
	            'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
	            proposalResponses[0].response.status, proposalResponses[0].response.message,
	            proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
	        var request = {
	            proposalResponses: proposalResponses,
	            proposal: proposal,
	            header: header
	        };
	        // set the transaction listener and set a timeout of 30sec
	        // if the transaction did not get committed within the timeout period,
	        // fail the test
	        var transactionID = tx_id.getTransactionID();
	        var eventPromises = [];
	        let eh = client.newEventHub();
	        eh.setPeerAddr(optionsInvoke.event_url);
	        eh.connect();

	        let txPromise = new Promise((resolve, reject) => {
	            let handle = setTimeout(() => {
	                eh.disconnect();
	                reject();
	            }, 30000);

	            eh.registerTxEvent(transactionID, (tx, code) => {
	                clearTimeout(handle);
	                eh.unregisterTxEvent(transactionID);
	                eh.disconnect();

	                if (code !== 'VALID') {
	                    console.error(
	                        'The transaction was invalid, code = ' + code);
	                    reject();
	                } else {
	                    console.log(
	                        'The transaction has been committed on peer ' +
	                        eh._ep._endpoint.addr);
	                    resolve();
	                }
	            });
	        });
	        eventPromises.push(txPromise);
	        var sendPromise = channel.sendTransaction(request);
	        return Promise.all([sendPromise].concat(eventPromises)).then((results) => {
	            console.log(' event promise all complete and testing complete');
	            return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
	        }).catch((err) => {
	            console.error(
	                'Failed to send transaction and get notifications within the timeout period.'
	            );
	            return 'Failed to send transaction and get notifications within the timeout period.';
	        });
	    } else {
	        console.error(
	            'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...'
	        );
	        return 'Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...';
	    }
	}, (err) => {
	    console.error('Failed to send proposal due to error: ' + err.stack ? err.stack :
	        err);
	    return 'Failed to send proposal due to error: ' + err.stack ? err.stack :
	        err;
	}).then((response) => {
	    if (response.status === 'SUCCESS') {
	        console.log('Successfully sent transaction to the orderer.');
	        res.redirect('/cars');
	        return tx_id.getTransactionID();
	    } else {
	        console.error('Failed to order the transaction. Error code: ' + response.status);
	        return 'Failed to order the transaction. Error code: ' + response.status;
	    }
	}, (err) => {
	    console.error('Failed to send transaction due to error: ' + err.stack ? err
	        .stack : err);
	    return 'Failed to send transaction due to error: ' + err.stack ? err.stack :
	        err;
	});
});


app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
});