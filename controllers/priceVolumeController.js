const router = require('express').Router();
const dataUtil = require(`${__dirname}/../utils/dataUtils.js`);

let cacheDaysPassed = 1;

router.get('/', (req, res) => {
	dataUtil.updateTodaysCache();
	if (cacheDaysPassed < 30) {
		dataUtil.putPastDayToCache(cacheDaysPassed);
		cacheDaysPassed++;
	}
	res.send({ time: Date.now() });
});

router.get('/1h/seperated/:count', async (req, res) => {
	let result = [];
	if (req.params.count > 0) {
		result = await dataUtil.getPricesSeparately(req.params.count);
		const volume = result.reduce((total, e) => total + e.size, 0);
		console.log('result size > ' + result.length + ' vol > ' + volume);
	}

	res.send(result);
});

// and to be honest can delete as well.. should not get duplicates anymore
router.get('/1h/seperated/:count/check', async (req, res) => {
	let result = [];
	if (req.params.count > 0) {
		result = await dataUtil.getPricesSeparately(req.params.count);
		const volume = result.reduce((total, e) => total + e.size, 0);
		for (let i = 0; i < result.length; i++) {
			for (let j = i + 1; j < result.length - 1; j++) {
				if (result[i].price == result[j].price && result[i].side == result[j].side) {
					console.log(`its double ${i} and ${j}
					i = > ${result[i]}
					j = > ${result[j]}`);
				}
			}
		}
		console.log('CHECK result size > ' + result.length + ' vol > ' + volume);
	}

	res.send(result);
});

router.get('/1h/merged/:count', async (req, res) => {
	let result = [];
	if (req.params.count > 0) {
		result = await dataUtil.getPricesMerged(req.params.count);
		const volume = result.reduce((total, e) => Object.values(e.data).reduce((r, o) => r + o, 0) + total, 0);
		console.log('CHECK result size > ' + result.length + ' vol > ' + volume);
	}
	res.send(result);
});

router.get('/1h/sellandbuy/:count', async (req, res) => {
	const result = req.params.count > 0 ? await dataUtil.getSellAndBuy(req.params.count) : [];
	res.send(result);
});

module.exports = router;
