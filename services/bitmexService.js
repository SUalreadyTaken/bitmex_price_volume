const request = require('request');
const priceVolume = require('../models/priceVolume.js');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config({ path: '../config.env' });

let lastTradeId;
let lastTimestamp;

const SECRET = process.env.API_KEY;
const API_ID = process.env.API_ID;
const verb = 'GET';
const expires = process.env.API_EXPIRES;
const PATH = process.env.BITMEX_PATH;

const signature = crypto
	.createHmac('sha256', SECRET)
	.update(verb + PATH + expires)
	.digest('hex');

const headers = {
	'content-type': 'application/json',
	Accept: 'application/json',
	'X-Requested-With': 'XMLHttpRequest',
	'api-expires': expires,
	'api-key': API_ID,
	'api-signature': signature
};

const requestOptions = {
	headers: headers,
	url: 'https://www.bitmex.com' + PATH,
	method: verb
};

function requestData(boolean) {
	// TODO error handling
	// request can come back as 502 bad request.. handle it
	// main app
	// if (boolean) getData();
	// alternative app
	if (!boolean) getData();
}

function getData() {
	request(requestOptions, async (err, res, body) => {
		if (err) {
			console.log('ERROR in bitmex request');
			console.log(err);
			return;
		}

		let json = '';
		try {
			json = JSON.parse(body);
		} catch (error) {
			console.log(new Date().toLocaleTimeString() + 'Error in paring json');
			console.log(body);
			console.log(error);
			return;
		}

		let tmpTrades = [];
		// push needed trades to tmpTrades
		if (!lastTradeId) {
			console.log('should see this only once');
			for (trade of json) {
				let tmp = {
					price: trade.price,
					side: trade.side,
					size: trade.size
				};
				tmpTrades.push(tmp);
			}
		} else {
			for (trade of json) {
				// seems to work with || timestamp.. dunno do they remove trades ??
				// it still fks up some numbers because different trades can have same timestamp..multiple inserts
				if (trade.trdMatchID === lastTradeId || lastTimestamp > trade.timestamp) {
					break;
				}
				let tmp = {
					price: trade.price,
					side: trade.side,
					size: trade.size
				};
				tmpTrades.push(tmp);
			}
		}

		if (tmpTrades.length > 0) {
			lastTradeId = json[0].trdMatchID;
			lastTimestamp = json[0].timestamp;
		}

		// for debug
		if (tmpTrades.length > 900) {
			console.log(new Date().toLocaleTimeString() + ' length over 900 actual > ' + tmpTrades.length);
		}

		// merge tmpTrades for fewer queries
		// only 1k max elements dont really need binary search
		let trades = [];
		for (tmp of tmpTrades) {
			let found = false;
			for (trade of trades) {
				if (tmp.price == trade.price && tmp.side == trade.side) {
					trade.size = trade.size + tmp.size;
					found = true;
					break;
				}
			}
			if (!found) {
				trades.push(tmp);
			}
		}

		const priceVolumeModel = priceVolume.getCurrentHourCollection();
		for (trade of trades) {
			const existing = {
				price: trade.price,
				side: trade.side
			};
			// find existing document
			const alreadyExists = await priceVolumeModel
				.findOne(existing)
				.exec()
				.catch((err) => console.log('Error in finding existing > ' + err));

			if (!alreadyExists) {
				// if not existing document create new
				const doc = new priceVolumeModel(trade);
				await doc.save().catch((err) => console.log('Error in adding new > ' + err));
			} else {
				// if already exists update size
				const newSize = alreadyExists.size + trade.size;
				await priceVolumeModel
					.findOneAndUpdate(existing, { size: newSize })
					.exec()
					.catch((err) => console.log('Error in updating > ' + err));
			}
		}
	});
}

module.exports = { requestData };
