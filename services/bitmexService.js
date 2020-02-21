const request = require('request');
const priceVolume = require('../models/priceVolume.js');
const dotenv = require('dotenv');
const crypto = require('crypto');
const sleep = require('util').promisify(setTimeout);
const fastSort = require('fast-sort');

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
	'api-signature': signature
};

const requestOptions = {
	headers: headers,
	url: 'https://www.bitmex.com' + PATH,
	method: verb
};

function requestData(boolean) {
	// main app
	// if (insertsDone && boolean) getData();
	// FIXME alternative app
	if (insertsDone && (!boolean && boolean != undefined)) getData();
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
			if (needToSleep > 0) {
				await sleep(needToSleep);
			}
			insertsDone = true;
			return;
		}

		if (res.statusCode == 200) {
			let json = JSON.parse(body);

			let tmpTrades = [];
			// push needed trades to tmpTrades
			if (!lastTradeId) {
				console.log('should see this only once');
				for (trade of json) {
					let tmp = {
						price: trade.price,
						side: trade.side,
						size: trade.size, 
						timestamp: currentTimestamp
					};
					tmpTrades.push(tmp);
				}
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
						timestamp: currentTimestamp
					};
					tmpTrades.push(tmp);
				}
			}

			if (tmpTrades.length > 0) {
				lastTradeId = json[0].trdMatchID;
				lastTimestamp = json[0].timestamp;
				if (tmpTrades.length > 900) {
					console.log(new Date().toLocaleTimeString() + ' length over 900 actual > ' + tmpTrades.length);
				}
				// merge tmpTrades for fewer queries
				let trades = [];
				if (tmpTrades.length > 1) {
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
				} else {
					trades = tmpTrades;
				}

				let updateBulk = [];
				const model = priceVolume.getCurrentDayCollectionModel();
				let existingPrices = await model.find({timestamp : currentTimestamp}).exec();
				existingPrices = fastSort(existingPrices).asc((d) => d.price);
				for (trade of trades) {
					let found = binarySearch(existingPrices, trade.price, 0, existingPrices.length - 1);
					if (!isNaN(found)) {
						let find = [found - 1, found, found + 1];
						let difSide = true;
						for (x of find) {
							if (x >= 0 && x <= existingPrices.length - 1) {
								if (existingPrices[x].price == trade.price && existingPrices[x].side == trade.side) {
									const newSize = existingPrices[x].size + trade.size;
									difSide = false;
									updateBulk.push({
										updateOne: {
											filter: { price: trade.price, side: trade.side },
											update: { size: newSize }
										}
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

				if (updateBulk.length > 0) {
					await model.bulkWrite(updateBulk).catch((err) => {
						console.log(err);
					});
				}

				if (tmpTrades.length > 500) {
					console.log(
						new Date().toLocaleTimeString() +
							' | Time > ' +
							(new Date() - start) +
							' | size > ' +
							tmpTrades.length +
							' | mergeSize > ' +
							trades.length
					);
				}
			}
		} else {
			// If you are limited, you will receive a 429 response and an additional header, Retry-After,
			// that indicates the number of seconds you should sleep before retrying.
			console.log(res.headers);
			console.log('status isnt 200 it is > ' + res.statusCode);
		}
		const needToSleep = 1000 - (new Date() - start);
		if (needToSleep > 0) {
			await sleep(needToSleep);
		}
		insertsDone = true;
	});
}

function binarySearch(arr, x, start, end) {
	if (start > end) return 'nope';

	let mid = Math.floor((start + end) / 2);

	if (arr[mid].price == x) return mid;

	if (arr[mid].price > x) return binarySearch(arr, x, start, mid - 1);
	else return binarySearch(arr, x, mid + 1, end);
}

module.exports = { requestData };
