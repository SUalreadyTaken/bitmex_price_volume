const mongoose = require('mongoose');
const assert = require('chai').assert;
const fs = require('fs').promises;
const mockdate = require('mockdate');
const priceVolume = require(`${__dirname}/../models/priceVolume.js`);
const dataUtils = require(`${__dirname}/../utils/dataUtils.js`);
const dotenv = require('dotenv');
dotenv.config({ path: `${__dirname}/../config.env` });

describe('dataUtils tests', () => {
    const consoleLog = console.log;
    before(async () => {
		// disable logs
		console.log = function () {};
        mockdate.set('2020-06-18T01:25:11.232Z');
		const DB = process.env.TEST_DATABASE;
		mongoose.connect(DB, {
            useNewUrlParser: true,
			useCreateIndex: true,
			useFindAndModify: false,
			useUnifiedTopology: true,
		});
		await populateDatabase();
	});
    
	after(async () => {
        console.log = consoleLog;
		await dropAllCollections();
		mockdate.reset();
		mongoose.disconnect();
	});

	describe('# dataUtils_getSellAndBuy', () => {
		const reqHours = 27;
		// equals 2
		const currentDayHour = new Date().getHours() + 1;
		it(`return current days data`, async () => {
			const data = await dataUtils.getSellAndBuy(currentDayHour);
			assert.equal(data.length, currentDayHour, `Must return array size of ${currentDayHour}`);
		});
		it(`return ${reqHours} hours of data`, async () => {
			const data = await dataUtils.getSellAndBuy(reqHours);
			assert.equal(data.length, reqHours, `Must return array size of ${reqHours}`);
		});
		it('buy and sell totals', async () => {
			const data = await dataUtils.getSellAndBuy(reqHours);
			for (d of data) {
				assert.equal(d.sell, 10, 'Sell total must equal 10');
				assert.equal(d.buy, 10, 'Buy total must equal 10');
			}
		});
		it('right timestamps', async () => {
			const data = await dataUtils.getSellAndBuy(reqHours);
			const currentTimestamp = new Date().setHours(new Date().getHours(), 0, 0, 0) / 1000;
			let rightTimestamps = [];
			for (let i = 0; i < reqHours; i++) {
				rightTimestamps.push(currentTimestamp - i * 60 * 60);
			}
			for (const [i, d] of data.entries()) {
				assert.equal(d.timestamp, rightTimestamps[i], 'Timestamps must equal');
			}
		});
	});

	describe('# separatedData', () => {
		const reqHours = 27;
		it(`return length 20`, async () => {
			const data = await dataUtils.getPricesSeparately(reqHours);
			assert.equal(data.length, 20, 'must return 20');
		});
		it(`buy and sell total is ${reqHours}`, async () => {
			const data = await dataUtils.getPricesSeparately(reqHours);
			for (d of data) {
				assert.equal(d.size, reqHours, `Total must equal ${reqHours}`);
			}
		});
		it('no duplicates', async () => {
			const data = await dataUtils.getPricesSeparately(reqHours);
			for (let i = 0; i < data.length - 1; i++) {
				for (let j = i + 1; j < data.length; j++) {
					assert.isFalse((data[i].price === data[j].price && data[i].side === data[j].side), 'No duplicates');
				}
			}
		});
	});

	describe('# mergedData', () => {
		const reqHours = 27;
		it(`return length 10`, async () => {
			const data = await dataUtils.getPricesMerged(reqHours);
			assert.equal(data.length, 10, 'must return 20');
		});
		it(`buy and sell total is ${reqHours}`, async () => {
			const data = await dataUtils.getPricesMerged(reqHours);
			for (d of data) {
				if (d.data['sell']) {
					assert.equal(d.data.sell, reqHours, `Sell total must equal ${reqHours}`);
				} else {
					assert.equal(d.data.buy, reqHours, `Buy total must equal ${reqHours}`);
				}
			}
		});
		it('no duplicates', async () => {
			const data = await dataUtils.getPricesMerged(reqHours);
			for (let i = 0; i < data.length - 1; i++) {
				for (let j = i + 1; j < data.length; j++) {
					assert.isFalse((data[i].price === data[j].price), 'No duplicates');
				}
			}
		});
	});
});

async function dropAllCollections() {
	const collections = await mongoose.connection.db.collections();

	for (let collection of collections) {
		await mongoose.connection.db.dropCollection(collection.namespace.split('.')[1]);
	}
}

async function populateDatabase() {
	const day1 = await fs.readFile(__dirname + '/helpers/1592438400.json', 'utf-8');
	const day2 = await fs.readFile(__dirname + '/helpers/1592352000.json', 'utf-8');
	const day3 = await fs.readFile(__dirname + '/helpers/1592265600.json', 'utf-8');
	const daysData = [[...JSON.parse(day1)], [...JSON.parse(day2)], [...JSON.parse(day3)]];
	for (let i = 0; i < 3; i++) {
		const model = priceVolume.getPastDaysCollectionModel(i);
		let daysDataBulk = [];
		for (doc of daysData[i]) {
			daysDataBulk.push({ insertOne: { document: new model(doc) } });
		}
		await model.bulkWrite(daysDataBulk).catch((err) => console.log(err));
		daysDataBulk = [];
	}
}
