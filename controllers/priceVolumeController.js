const request = require('request');
const router = require('express').Router();
const priceVolume = require('../models/priceVolume.js');
const fastSort = require('fast-sort');

router.get('/', async (req, res) => {
	const currentHour = priceVolume.getCurrentHourCollection();
	const timestamp = currentHour.collection.collectionName.split('_')[1];
	let hourData = await currentHour.find({}, { _id: 0, __v: 0 }).exec();
	const result = { timestamp: timestamp, data: hourData };
	res.send(result);
});

router.get('/1h/:count', async (req, res) => {
	let result = [];
	const currentHour = priceVolume.getCurrentHourCollection();
	let currentHourData = await currentHour.find({}, { _id: 0, __v: 0 }).exec();
	result = fastSort(currentHourData).asc((d) => d.price);
	for (let i = 1; i < req.params.count; i++) {
		const pastHour = priceVolume.getPastHourCollection(i);
		let hourData = await pastHour.find({}, { _id: 0, __v: 0 }).exec();
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
	}

	console.log('result size > ' + result.length);
	res.send(result);
});

router.get('/1h/check/:count', async (req, res) => {
	let result = [];
	const currentHour = priceVolume.getCurrentHourCollection();
	let currentHourData = await currentHour.find({}, { _id: 0, __v: 0 }).exec();
	result = fastSort(currentHourData).asc(d=>d.price);
	for (let i = 1; i < req.params.count; i++) {
		const pastHour = priceVolume.getPastHourCollection(i);
		let hourData = await pastHour.find({}, { _id: 0, __v: 0 }).exec();
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
		fastSort(result).asc(d=>d.price);
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

router.get('/real/:count', async (req, res) => {
	let result = [];
	const currentHour = priceVolume.getCurrentHourCollection();
	let currentHourData = await currentHour.find({}, { _id: 0, __v: 0 }).exec();
	result = currentHourData;
	for (let i = 1; i < req.params.count; i++) {
		const pastHour = priceVolume.getPastHourCollection(i);
		let hourData = await pastHour.find({}, { _id: 0, __v: 0 }).exec();
		for (data of hourData) {
			let found = false;
			for (x of result) {
				if (data.price == x.price && data.side == x.side) {
					x.size = x.size + data.size;
					found = true;
					break;
				}
			}
			if (!found) {
				result.push(data);
			}
		}
	}
	result = currentHourData.sort((a, b) => a.price - b.price);
	console.log('FIRST result size > ' + result.length);
	res.send(result);
});

router.get('/1h/report/:count', async (req, res) => {
	let result = [];
	for (let i = 0; i < req.params.count; i++) {
		const pastHour = priceVolume.getPastHourCollection(i);
		const hourData = await pastHour.find({}, { _id: 0, __v: 0 }).exec();
		const timestamp = pastHour.collection.collectionName.split('_')[1];
		result.push({ timestamp: timestamp, data: hourData });
	}
	res.send(result);
});

function binarySearch(arr, x, start, end) {
	if (start > end) return 'nope';

	let mid = Math.floor((start + end) / 2);

	if (arr[mid].price == x) return mid;

	if (arr[mid].price > x) return binarySearch(arr, x, start, mid - 1);
	else return binarySearch(arr, x, mid + 1, end);
}

module.exports = router;
