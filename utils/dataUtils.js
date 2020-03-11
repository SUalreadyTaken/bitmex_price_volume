const priceVolume = require('../models/priceVolume.js');
const fastSort = require('fast-sort');
const PseudoCache = require('../models/pseudoCache.js');

const pseudoCache = new PseudoCache();

async function getData(reqParam) {
	let result = [];
	// current day
	const currentTime = new Date();
	const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
	let hoursOver = reqParam - (currentTime.getHours() + 1);
	let model = priceVolume.getCurrentDayCollectionModel();
	if (hoursOver <= 0) {
		// push todays data >= request lastTimestamp
		// query current hours data
		result = await model
			.find({ timestamp: currentTimestamp }, { _id: 0, __v: 0 })
			.lean()
			.exec();
		fastSort(result).asc((d) => d.price);
		if (reqParam != 1) {
			let data = await pseudoCache.getTodaysCache();
			if (data.length > 0) {
				let index = data.length - 1;
				for (let i = 1; i < reqParam; i++) {
					const findStamp = currentTimestamp - i * 60 * 60;
					const tmpResult = pushDataAndRemoveIndex(findStamp, data, index, result);
					result = tmpResult.result;
					index = tmpResult.index;
				}
			}
		}
	} else {
		// need past days data
		result = await model
			.find({ timestamp: currentTimestamp }, { _id: 0, __v: 0 })
			.lean()
			.exec();
		fastSort(result).asc((d) => d.price);
		let todaysData = await pseudoCache.getTodaysCache();
		if (todaysData.length > 0) {
			let index = todaysData.length - 1;
			// push current days data
			for (let i = 1; i <= currentTime.getHours(); i++) {
				const findStamp = currentTimestamp - i * 60 * 60;
				const tmpResult = pushDataAndRemoveIndex(findStamp, todaysData, index, result);
				result = tmpResult.result;
				index = tmpResult.index;
			}
		}
		let needDays = 0;
		hoursOver % 24 == 0 ? (needDays = hoursOver / 24) : (needDays = Math.floor(hoursOver / 24) + 1);
		// past days
		let highTimestamp = model.modelName.split('_')[1];
		for (let i = 0; i < needDays; i++) {
			if (Math.floor(hoursOver / 24) != 0) {
				// take the whole days data
				let thatDaysData = await pseudoCache.getDay(i + 1);
				hoursOver = hoursOver - 24;
				if (thatDaysData.length > 0) {
					let index = thatDaysData.length - 1;
					for (let j = 1; j <= 24; j++) {
						const findStamp = highTimestamp - j * 60 * 60;
						const tmpResult = pushDataAndRemoveIndex(findStamp, thatDaysData, index, result);
						result = tmpResult.result;
						index = tmpResult.index;
					}
				}
			} else {
				// take only few hours
				let thatDaysData = await pseudoCache.getDay(i + 1);
				if (thatDaysData.length > 0) {
					let index = thatDaysData.length - 1;
					for (let j = 1; j <= hoursOver; j++) {
						const findStamp = highTimestamp - j * 60 * 60;
						const tmpResult = pushDataAndRemoveIndex(findStamp, thatDaysData, index, result);
						result = tmpResult.result;
						index = tmpResult.index;
					}
				}
			}
			const date = new Date().setHours(0, 0, 0, 0);
			highTimestamp = date / 1000 - (i + 1) * 24 * 60 * 60;
		}
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

function pushDataAndRemoveIndex(findStamp, data, index, result) {
	let stampData = [];
	let resIndex = 0;
	for (let i = index; i >= 0; i--) {
		if (data[i].timestamp == findStamp) {
			stampData.push(data[i]);
		} else {
			resIndex = i;
			break;
		}
	}
	const res = pushNewData(stampData, result);
	return { result: res, index: resIndex };
}

function pushNewData(hourData, result) {
	let newData = [];
	for (data of hourData) {
		let found = binarySearch(result, data.price, 0, result.length - 1);
		if (!isNaN(found)) {
			let find = [found - 1, found, found + 1];
			let difSide = true;
			for (x of find) {
				if (x >= 0 && x <= result.length - 1) {
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
					timestamp: data.timestamp
				};
				newData.push(d);
			}
		} else {
			const d = {
				price: data.price,
				side: data.side,
				size: data.size,
				timestamp: data.timestamp
			};
			newData.push(d);
		}
	}
	result = result.concat(newData);
	fastSort(result).asc((d) => d.price);
	return result;
}

function updateTodaysCache() {
	pseudoCache.getTodaysCache();
}

module.exports = { getData, binarySearch, updateTodaysCache};
