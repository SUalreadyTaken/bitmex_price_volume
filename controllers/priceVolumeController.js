const router = require('express').Router();
const priceVolume = require('../models/priceVolume.js');
const fastSort = require('fast-sort');

router.get('/', (req, res) => {
	res.send({time:Date.now()});
});

router.get('/1h/:count', async (req, res) => {
	let result = [];
	if (req.params.count > 0) {
		const currentTime = new Date();
		const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
		let hoursOver = req.params.count - (currentTime.getHours() + 1);
		let model = priceVolume.getCurrentDayCollectionModel();

		if (hoursOver <= 0) {
			// push todays data >= request lastTimestamp
			const lastTimestamp = currentTimestamp - (req.params.count - 1) * 60 * 60;
			let data = await model.find({ timestamp: { $gte: lastTimestamp } }, { _id: 0, __v: 0 }).exec();
			for (let i = 0; i < req.params.count; i++) {
				const findStamp = currentTimestamp - i * 60 * 60;
				const tmpResult = pushDataAndRemove(findStamp, data, result);
				result = tmpResult.result;
				data = tmpResult.data;
			}
		} else {
			let todaysData = await model.find({}, { _id: 0, __v: 0 }).exec();
			for (let i = 0; i <= currentTime.getHours(); i++) {
				const findStamp = currentTimestamp - i * 60 * 60;
				const tmpResult = pushDataAndRemove(findStamp, todaysData, result);
				result = tmpResult.result;
				todaysData = tmpResult.data;
			}
			let needDays = 0;
			hoursOver % 24 == 0 ? (needDays = hoursOver / 24) : (needDays = Math.floor(hoursOver / 24) + 1);
			for (let i = 0; i < needDays; i++) {
				const highTimestamp = model.modelName.split('_')[1];
				model = priceVolume.getPastDaysCollectionModel(i + 1);
				if (Math.floor(hoursOver / 24) != 0) {
					// take the whole days data
					let thatDaysData = await model.find({}, { _id: 0, __v: 0 }).exec();
					hoursOver = hoursOver - 24;
					for (let j = 1; j <= 24; j++) {
						const findStamp = highTimestamp - j * 60 * 60;
						const tmpResult = pushDataAndRemove(findStamp, thatDaysData, result);
						result = tmpResult.result;
						thatDaysData = tmpResult.data;
					}
				} else {
					// take only few hours
					const lastTimestamp = highTimestamp - hoursOver * 60 * 60;
					let thatDaysData = await model
						.find({ timestamp: { $gte: lastTimestamp } }, { _id: 0, __v: 0 })
						.exec();
					for (let j = 1; j <= hoursOver; j++) {
						const findStamp = highTimestamp - j * 60 * 60;
						const tmpResult = pushDataAndRemove(findStamp, thatDaysData, result);
						result = tmpResult.result;
						thatDaysData = tmpResult.data;
					}
				}
			}
		}
	}
	console.log('result size > ' + result.length);
	// TODO remove timestamp from result.. gives no value
	res.send(result);
});

// and to be honest can delete as well.. should not get duplicates anymore
router.get('/1h/check/:count', async (req, res) => {
	let result = [];
	if (req.params.count > 0) {
		const currentTime = new Date();
		const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
		let hoursOver = req.params.count - (currentTime.getHours() + 1);
		let model = priceVolume.getCurrentDayCollectionModel();

		if (hoursOver <= 0) {
			// push todays data >= request lastTimestamp
			const lastTimestamp = currentTimestamp - (req.params.count - 1) * 60 * 60;
			let data = await model.find({ timestamp: { $gte: lastTimestamp } }, { _id: 0, __v: 0 }).exec();
			for (let i = 0; i < req.params.count; i++) {
				const findStamp = currentTimestamp - i * 60 * 60;
				const tmpResult = pushDataAndRemove(findStamp, data, result);
				result = tmpResult.result;
				data = tmpResult.data;
			}
		} else {
			let todaysData = await model.find({}, { _id: 0, __v: 0 }).exec();
			// push current days data
			for (let i = 0; i <= currentTime.getHours(); i++) {
				const findStamp = currentTimestamp - i * 60 * 60;
				const tmpResult = pushDataAndRemove(findStamp, todaysData, result);
				result = tmpResult.result;
				todaysData = tmpResult.data;
			}
			let needDays = 0;
			hoursOver % 24 == 0 ? (needDays = hoursOver / 24) : (needDays = Math.floor(hoursOver / 24) + 1);
			for (let i = 0; i < needDays; i++) {
				const highTimestamp = model.modelName.split('_')[1];
				model = priceVolume.getPastDaysCollectionModel(i + 1);
				if (Math.floor(hoursOver / 24) != 0) {
					// take the whole days data
					let thatDaysData = await model.find({}, { _id: 0, __v: 0 }).exec();
					hoursOver = hoursOver - 24;
					for (let j = 1; j <= 24; j++) {
						const findStamp = highTimestamp - j * 60 * 60;
						const tmpResult = pushDataAndRemove(findStamp, thatDaysData, result);
						result = tmpResult.result;
						thatDaysData = tmpResult.data;
					}
				} else {
					// take only few hours
					const lastTimestamp = highTimestamp - hoursOver * 60 * 60;
					let thatDaysData = await model
						.find({ timestamp: { $gte: lastTimestamp } }, { _id: 0, __v: 0 })
						.exec();
					for (let j = 1; j <= hoursOver; j++) {
						const findStamp = highTimestamp - j * 60 * 60;
						const tmpResult = pushDataAndRemove(findStamp, thatDaysData, result);
						result = tmpResult.result;
						thatDaysData = tmpResult.data;
					}
				}
			}
		}
	}

	for (let i = 0; i < result.length; i++) {
		for (let j = i + 1; j < result.length - 1; j++) {
			if (result[i].price == result[j].price && result[i].side == result[j].side) {
				console.log(`its double ${i} and ${j}
	            i = > ${result[i]}
	            j = > ${result[j]}`);
			}
		}
	
	}
	console.log('CHECK result size > ' + result.length);
	res.send(result);
});

function binarySearch(arr, x, start, end) {
	if (start > end) return 'nope';

	let mid = Math.floor((start + end) / 2);

	if (arr[mid].price == x) return mid;

	if (arr[mid].price > x) return binarySearch(arr, x, start, mid - 1);
	else return binarySearch(arr, x, mid + 1, end);
}

function pushDataAndRemove(findStamp, data, result) {
	let stampData = [];
	let dataWithout = [];
	/* TODO
	data in collection are with sequential timestamps
	so i can break if timestamp changes and push the rest to dataWithout
	...
	or send back result and index where new timestamp starts 
	...
	might win some milliseconds
	*/
	for (d of data) {
		if (d.timestamp == findStamp) {
			stampData.push(d);
		} else {
			dataWithout.push(d);
		}
	}
	const res = pushNewData(stampData, result);
	return { result: res, data: dataWithout };
	// return result = pushNewData(stampData, result);
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
				newData.push(data);
			}
		} else {
			newData.push(data);
		}
	}
	result = result.concat(newData);
	fastSort(result).asc((d) => d.price);
	return result;
}

module.exports = router;
