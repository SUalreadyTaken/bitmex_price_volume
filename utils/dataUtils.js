const priceVolume = require(`${__dirname}/../models/priceVolume.js`);
const fastSort = require('fast-sort');
const PseudoCache = require(`${__dirname}/../models/pseudoCache.js`);

const pseudoCache = new PseudoCache();

/**
 * Get past hours data array, prices seperated by side
 * 
 * [{
    "price": 9314,
    "side": "Sell",
    "size": 64165
  },
  {
    "price": 9314.5,
    "side": "Buy",
    "size": 442162
  },
  {
    "price": 9314.5,
    "side": "Sell",
    "size": 142796
  }]
 * 
 * @param {number} reqHours How many hours to look back (current hour = 1)
 */
async function getPricesSeparately(reqHours) {
	let result = [];
	// current day
	const currentTime = new Date();
	const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
	let hoursOver = reqHours - (currentTime.getHours() + 1);
	let model = priceVolume.getCurrentDayCollectionModel();
	result = await model.find({ timestamp: currentTimestamp }, { _id: 0, __v: 0, timestamp: 0 }).lean().exec();
	fastSort(result).asc((d) => d.price);
	
	if (hoursOver <= 0) {
		// need only this days data
		if (reqHours != 1) {
			// xx:59:59 can get wrong data
			let data = await pseudoCache.getTodaysCache();
			if (data.length > 0) result = mergeWithDaysData(data, currentTimestamp, reqHours - 1, result);
		}
	} else {
		// also need past days data
		let data = await pseudoCache.getTodaysCache();
		// take todays data
		if (data.length > 0) result = mergeWithDaysData(data, currentTimestamp, currentTime.getHours(), result);

		let needDays = 0;
		hoursOver % 24 == 0 ? (needDays = hoursOver / 24) : (needDays = Math.floor(hoursOver / 24) + 1);
		// past days
		let highTimestamp = model.modelName.split('_')[1];
		for (let i = 0; i < needDays; i++) {
			if (Math.floor(hoursOver / 24) != 0) {
				let data = await pseudoCache.getDay(i + 1);
				hoursOver = hoursOver - 24;
				// take 24 hours
				if (data.length > 0) result = mergeWithDaysData(data, highTimestamp, 24, result);
			} else {
				let data = await pseudoCache.getDay(i + 1);
				// take only few hours
				if (data.length > 0) result = mergeWithDaysData(data, highTimestamp, hoursOver, result);
			}
			const date = new Date().setHours(0, 0, 0, 0);
			highTimestamp = date / 1000 - (i + 1) * 24 * 60 * 60;
		}
	}

	return result;
}

/**
 * Get past hours data array, elements merged by price
 * 
 * [{
    "price": 9314,
    "data": {
      "sell": 64165
    }
  },
  {
    "price": 9314.5,
    "data": {
      "sell": 142796,
      "buy": 442162
    }
  }]
 * 
 * @param {number} reqHours How many hours to look back (current hour = 1)
 */
async function getPricesMerged(reqParam) {
	let result = [];
	// current day
	const currentTime = new Date();
	const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
	let hoursOver = reqParam - (currentTime.getHours() + 1);
	let resultMap = new Map();
	let model = priceVolume.getCurrentDayCollectionModel();
	result = await model.find({ timestamp: currentTimestamp }, { _id: 0, __v: 0 }).lean().exec();
	dataToMap(result, resultMap);
	
	
	if (hoursOver <= 0) {
		// need only this days data
		if (reqParam != 1) {
			// xx:59:59 can get wrong data
			let data = await pseudoCache.getTodaysCache();
			if (data.length > 0) {
				const startIndex = getStartIndex(currentTimestamp, reqParam - 1, data);
				dataToMap(data.slice(startIndex, data.length), resultMap);
			}
		}
	} else {
		// need past days data
		// todays data
		let data = await pseudoCache.getTodaysCache();
		if (data.length > 0) dataToMap(data, resultMap);

		let needDays = 0;
		hoursOver % 24 == 0 ? (needDays = hoursOver / 24) : (needDays = Math.floor(hoursOver / 24) + 1);
		// past days
		let highTimestamp = model.modelName.split('_')[1];
		for (let i = 0; i < needDays; i++) {
			if (Math.floor(hoursOver / 24) != 0) {
				let data = await pseudoCache.getDay(i + 1);
				hoursOver = hoursOver - 24;
				// take the whole days data
				if (data.length > 0) dataToMap(data, resultMap);
			} else {
				let data = await pseudoCache.getDay(i + 1);
				// take only few hours
				if (data.length > 0) {
					const startIndex = getStartIndex(highTimestamp, hoursOver, data);
					dataToMap(data.slice(startIndex, data.length), resultMap);
				}
			}
			const date = new Date().setHours(0, 0, 0, 0);
			highTimestamp = date / 1000 - (i + 1) * 24 * 60 * 60;
		}
	}

	let endResult = Array.from(resultMap.values());
	fastSort(endResult).asc((d) => d.price);
	return endResult;
}

/**
 * Get past hours sell and buy total volume
 * @param {*} reqHours
 */
async function getSellAndBuy(reqHours) {
	let result = [];
	// current day
	const currentTime = new Date();
	const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
	let hoursOver = reqHours - (currentTime.getHours() + 1);
	let model = priceVolume.getCurrentDayCollectionModel();
	let currentHourData = await model.find({ timestamp: currentTimestamp }, { _id: 0, __v: 0 }).lean().exec();
	result.push(buildSellAndBuy(currentTimestamp, currentHourData));
	
	if (hoursOver <= 0) {
		// need only this days data
		if (reqHours != 1) {
			// xx:59:59 can get wrong data
			let data = await pseudoCache.getTodaysCache();
			if (data.length > 0) sellAndBuyToResult(data, currentTimestamp, reqHours - 1, result);
		}
	} else {
		// need past days data
		let data = await pseudoCache.getTodaysCache();
		// console.log(data);
		if (data.length > 0) sellAndBuyToResult(data, currentTimestamp, currentTime.getHours(), result);
		let needDays = 0;
		hoursOver % 24 == 0 ? (needDays = hoursOver / 24) : (needDays = Math.floor(hoursOver / 24) + 1);
		// past days
		let startingTimestamp = model.modelName.split('_')[1];
		for (let i = 0; i < needDays; i++) {
			if (Math.floor(hoursOver / 24) != 0) {
				hoursOver = hoursOver - 24;
				let data = await pseudoCache.getDay(i + 1);
				// take the whole days data
				if (data.length > 0) sellAndBuyToResult(data, startingTimestamp, 24, result);
			} else {
				let data = await pseudoCache.getDay(i + 1);
				// take only few hours
				if (data.length > 0) sellAndBuyToResult(data, startingTimestamp, hoursOver, result);
			}
			const date = new Date().setHours(0, 0, 0, 0);
			startingTimestamp = date / 1000 - (i + 1) * 24 * 60 * 60;
		}
	}
	return result;
}

function dataToMap(data, resultMap) {
	if (data.length > 0) {
		for (x of data) {
			const tmp = resultMap.get(x.price);
			// const lowerCaseSide = x.side;
			if (tmp !== undefined) {
				if (tmp.data[x.side]) {
					tmp.data[x.side] += x.size;
				} else {
					tmp.data[x.side] = x.size;
				}
			} else {
				resultMap.set(x.price, { price: x.price, data: { [x.side]: x.size } });
			}
		}
	}
}

// should be always string anyway
// const lowercaseFirst = (s) => typeof s === 'string' ? s.charAt(0).toLowerCase() + s.slice(1) : 'error';
// const lowercaseFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function getStartIndex(currentTimestamp, hourCount, data) {
	const lastTimestamp = currentTimestamp - hourCount * 60 * 60;
	let startIndex = 0;
	for (let i = data.length - 1; i >= 0; i--) {
		if (data[i].timestamp < lastTimestamp) {
			startIndex = i + 1;
			break;
		}
	}
	return startIndex;
}

function sellAndBuyToResult(data, startingTimestamp, hourCount, result) {
	let index = data.length - 1;
	for (let j = 1; j <= hourCount; j++) {
		const findStamp = startingTimestamp - j * 60 * 60;
		const tmpResult = getTimestampDataAndNextIndex(findStamp, data, index);
		index = tmpResult.index;
		result.push(buildSellAndBuy(findStamp, tmpResult.result));
	}
}

function buildSellAndBuy(currentTimestamp, data) {
	const sellTotal = data
		.filter((e) => e.side == 'sell')
		.map((e) => e.size)
		.reduce((total, e) => e + total, 0);
	const buyTotal = data
		.filter((e) => e.side == 'buy')
		.map((e) => e.size)
		.reduce((total, e) => e + total, 0);
	return { timestamp: currentTimestamp, sell: sellTotal, buy: buyTotal };
}

function mergeWithDaysData(data, currentTimestamp, hourCount, result) {
	let index = data.length - 1;
	for (let i = 1; i <= hourCount; i++) {
		const findStamp = currentTimestamp - i * 60 * 60;
		const tmpResult = getTimestampDataAndNextIndex(findStamp, data, index, result);
		index = tmpResult.index;
		result = mergeWithNewData(tmpResult.result, result);
	}
	return result;
}

function getTimestampDataAndNextIndex(findStamp, data, index) {
	let result = [];
	let resIndex = 0;
	for (let i = index; i >= 0; i--) {
		if (data[i].timestamp == findStamp) {
			result.push(data[i]);
		} else {
			resIndex = i;
			break;
		}
	}
	return { result, index: resIndex };
}

function mergeWithNewData(hourData, result) {
	let newData = [];
	for (data of hourData) {
		let found = binarySearch(result, data.price, 0, result.length - 1);
		if (!isNaN(found)) {
			let find = [found - 1, found, found + 1];
			let difSide = true;
			for (x of find) {
				if (x >= 0 && x < result.length) {
					if (result[x].price == data.price && result[x].side == data.side) {
						result[x].size = result[x].size + data.size;
						difSide = false;
						break;
					}
				}
			}
			if (difSide) {
				const d = {
					price: data.price,
					side: data.side,
					size: data.size,
					// timestamp: data.timestamp,
				};
				newData.push(d);
			}
		} else {
			const d = {
				price: data.price,
				side: data.side,
				size: data.size,
				// timestamp: data.timestamp,
			};
			newData.push(d);
		}
	}

	if (newData.length > 0) {
		result = result.concat(newData);
		fastSort(result).asc((d) => d.price);
	}
	return result;
}

function binarySearch(arr, x, start, end) {
	if (start > end) return 'nope';

	let mid = Math.floor((start + end) / 2);

	if (arr[mid].price == x) return mid;

	if (arr[mid].price > x) return binarySearch(arr, x, start, mid - 1);
	else return binarySearch(arr, x, mid + 1, end);
}

function updateTodaysCache() {
	pseudoCache.getTodaysCache();
}

function putPastDayToCache(daysPassed) {
	pseudoCache.getDay(daysPassed);
}

module.exports = {
	getPricesSeparately,
	binarySearch,
	updateTodaysCache,
	putPastDayToCache,
	getSellAndBuy,
	getPricesMerged,
};
