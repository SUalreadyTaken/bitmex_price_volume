const request = require('request');
const priceVolume = require('../models/priceVolume.js');
const dotenv = require('dotenv');
const crypto = require('crypto');
const sleep = require('util').promisify(setTimeout);
const fastSort = require('fast-sort');
const mongoose = require('mongoose');
const dataUtils = require('../utils/dataUtils.js');

dotenv.config({ path: '../config.env' });

let lastTradeId;
let lastTimestamp;
let insertsDone = true;

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
	'api-signature': signature,
};

const requestOptions = {
	headers: headers,
	url: 'https://www.bitmex.com' + PATH,
	method: verb,
};

function requestData(boolean) {
	// main app
	// if (insertsDone && boolean) getData();
	// FIXME alternative app
	if (insertsDone && !boolean && boolean != undefined) getData();
}

function getData() {
	insertsDone = false;
	request(requestOptions, async (err, res, body) => {
		const start = new Date();
		const t = new Date();
		const currentTimestamp = t.setHours(t.getHours(), 0, 0, 0) / 1000;
		if (err) {
			console.log('ERROR in bitmex request');
			console.log(err);
			const needToSleep = 1000 - (new Date() - start);
			if (needToSleep > 0) await sleep(needToSleep);
			insertsDone = true;
			return;
		}

		if (res.statusCode == 200 && isJSON(body)) {
			let json = JSON.parse(body);
			const tmpTrades = populateTmpData(json, currentTimestamp);
			if (tmpTrades.length > 0) {
				lastTradeId = json[0].trdMatchID;
				lastTimestamp = json[0].timestamp;
				if (tmpTrades.length > 900) {
					console.log(new Date().toLocaleTimeString() + ' length over 900 actual > ' + tmpTrades.length);
				}

				let trades = mergeTmpTrades(tmpTrades);

				trades = trades.map(
					(e) =>
						(e = {
							price: e.price,
							side: e.side.charAt(0).toLowerCase() + e.side.slice(1),
							size: e.size,
							timestamp: e.timestamp,
						})
				);

				const model = priceVolume.getCurrentDayCollectionModel();
				let existingPrices = await model.find({ timestamp: currentTimestamp }).exec();
				fastSort(existingPrices).asc((d) => d.price);
				const updateBulk = populateUpdateBulk(trades, existingPrices, model);

				if (updateBulk.length > 0) await model.bulkWrite(updateBulk).catch((err) => console.log(err));

				if (tmpTrades.length > 500)
					console.log(`Time > ${new Date() - start} | size > ${tmpTrades.length} mSize > ${trades.length}`);
			}
			const needToSleep = 1000 - (new Date() - start);
			if (needToSleep > 0) await sleep(needToSleep);

			insertsDone = true;
		} else {
			// TODO implement 429 sleep.. haven't gotten 429 in a week
			console.log(res.headers);
			console.log('status isnt 200 it is > ' + res.statusCode);
			const needToSleep = 1000 - (new Date() - start);
			if (needToSleep > 0) {
				await sleep(needToSleep);
			}
			insertsDone = true;
		}
	});
}

function isJSON(str) {
	try {
		return JSON.parse(str) && !!str;
	} catch (e) {
		console.log('json parse ERROR');
		console.log(e);
		return false;
	}
}

const populateTmpData = (json, currentTimestamp) => {
	let tmpTrades = [];
	if (!lastTradeId) {
		console.log('should see this only once');
		tmpTrades = json.map(
			(e) =>
				(e = {
					price: e.price,
					side: e.side,
					size: e.size,
					timestamp: currentTimestamp,
				})
		);
	} else {
		for (trade of json) {
			// FIXME should be ok now to remove timestamp ??
			if (trade.trdMatchID === lastTradeId || lastTimestamp > trade.timestamp) {
				break;
			}
			let tmp = {
				price: trade.price,
				side: trade.side,
				size: trade.size,
				timestamp: currentTimestamp,
			};
			tmpTrades.push(tmp);
		}
	}
	return tmpTrades;
};

const mergeTmpTrades = (tmpTrades) => {
	if (tmpTrades.length < 1) return tmpTrades;
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
	return trades;
};

const populateUpdateBulk = (trades, existingPrices, model) => {
	let updateBulk = [];
	for (trade of trades) {
		let found = dataUtils.binarySearch(existingPrices, trade.price, 0, existingPrices.length - 1);
		if (!isNaN(found)) {
			let find = [found - 1, found, found + 1];
			let difSide = true;
			for (x of find) {
				if (x >= 0 && x < existingPrices.length) {
					if (existingPrices[x].price == trade.price && existingPrices[x].side == trade.side) {
						const newSize = existingPrices[x].size + trade.size;
						difSide = false;
						updateBulk.push({
							updateOne: {
								filter: { _id: mongoose.Types.ObjectId(existingPrices[x].id) },
								update: { $set: { size: newSize } },
							},
						});
						break;
					}
				}
			}
			if (difSide) {
				updateBulk.push({ insertOne: { document: new model(trade) } });
			}
		} else {
			updateBulk.push({ insertOne: { document: new model(trade) } });
		}
	}
	return updateBulk;
};

module.exports = { requestData };