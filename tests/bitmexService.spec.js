const mongoose = require('mongoose');
const assert = require('chai').assert;
const fs = require('fs').promises;
const priceVolume = require(`${__dirname}/../models/priceVolume.js`);
const rewire = require('rewire');
const bitmexService = rewire(`${__dirname}/../services/bitmexService`);

const dotenv = require('dotenv');
dotenv.config({ path: `${__dirname}/../config.env` });

describe('bitmexService tests', () => {
	const consoleLog = console.log;
	before(function () {
		// disable logs
		console.log = function () {};
		const DB = process.env.TEST_DATABASE;
		mongoose.connect(
			DB,
			{
				useNewUrlParser: true,
				useCreateIndex: true,
				useFindAndModify: false,
				useUnifiedTopology: true,
			}
		);
	});

	after(async () => {
		console.log = consoleLog;
		await dropAllCollections();
		mongoose.disconnect();
	});

	describe('Insert bitmex api response to test db', () => {
		const insertNewData = bitmexService.__get__('insertNewData');
		const res = { statusCode: 200 };
		it('new data', async () => {
			const response1 = await fs.readFile(__dirname + '/helpers/bitmex_response_1.json', 'utf-8');
			const response2 = await fs.readFile(__dirname + '/helpers/bitmex_response_2.json', 'utf-8');

			await insertNewData(null, res, response1);
			await insertNewData(null, res, response2);

			const currentDayModel = priceVolume.getCurrentDayCollectionModel();
			const dataInDB = await currentDayModel.find({}).lean().exec();

			assert.lengthOf(dataInDB, 4, '4 entries in collection');
			dataInDB.forEach((e) => {
				assert.equal(e.size, 6, 'size should be 6');
			});
		}).timeout(3000);
		it('same old data', async () => {
			const response1 = await fs.readFile(__dirname + '/helpers/bitmex_response_1.json', 'utf-8');
			const response2 = await fs.readFile(__dirname + '/helpers/bitmex_response_2.json', 'utf-8');

			await insertNewData(null, res, response1);
			await insertNewData(null, res, response2);

			const currentDayModel = priceVolume.getCurrentDayCollectionModel();
			const dataInDB = await currentDayModel.find({}).lean().exec();

			// 0 entries because 'insertNewData' globals are initiated
			assert.lengthOf(dataInDB, 4, '4 entries in collection, same old no new');
		}).timeout(3000);
		it('over 2 seconds', async () => {
			const start = new Date();
			await insertNewData(null, res, null);
			await insertNewData(null, res, null);
			assert.isTrue(new Date() - start >= 2000, 'should take over 2 seconds, 1 per call');
		}).timeout(3000);
	});
});

async function dropAllCollections() {
	const collections = await mongoose.connection.db.collections();

	for (let collection of collections) {
		await mongoose.connection.db.dropCollection(collection.namespace.split('.')[1]);
	}
}
