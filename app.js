const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cors = require('cors');
const request = require('request');
const sleep = require('util').promisify(setTimeout);
const fetch = require('node-fetch');

const bitmexService = require('./services/bitmexService.js');
const { AlternativeModel } = require('./models/alternative.js');
const priceVolumeController = require('./controllers/priceVolumeController.js');

const app = express();

app.enable('trust proxy');
app.use(cors());
app.options('*', cors());

if (process.env.NODE_ENV === 'development') {
	app.use(morgan('dev'));
}

const limiter = rateLimit({
	max: 100,
	windowMs: 60 * 1000,
	message: 'Too many requests from this IP, please try again in a minute!'
});
app.use('/api', limiter);
app.use('/pricevolume', priceVolumeController);
let alternativeBoolean = undefined;
getAlternativeBoolean();

setInterval(() => bitmexService.requestData(alternativeBoolean), 1150);
// switch application every 7 days
setInterval(() => {
	console.log('SWITCHING APPS');
	switchToAlternative();
}, 259200000);
// 7 days in milliseconds
//604800000

// // ping heroku app so it doesn't fall asleep
setInterval(() => {
	// main app
	// if (alternativeBoolean) request(process.env.HEROKU_URL + '/pricevolume/1h/check/1');
	// alternative app
	if (!alternativeBoolean) request(process.env.HEROKU_URL + 'pricevolume/1h/check/24');
}, 240000);

async function getAlternativeBoolean() {
	const doc = await AlternativeModel.findOne().exec();
	alternativeBoolean = !doc.alternativeApp;
}

async function switchToAlternative() {
	const doc = await AlternativeModel.findOne().exec();
	//switch alternative boolean
	// const falseBoolean = !doc.alternativeApp;
	await AlternativeModel.findOneAndUpdate(doc.alternativeApp, { alternativeApp: !doc.alternativeApp }).exec();
	let status200 = false;
	for (let i = 0; i < 48; i++) {
		console.error('alternative app still isnt awake');
		const response = await fetch(process.env.HEROKU_URL_ALTERNATIVE);
		if (response.ok) status200 = !status200;
		if (status200) {
			console.log('alternative app is awake');
			alternativeBoolean = !alternativeBoolean;
			break;
		}
		await sleep(5000);
	}

	if (!status200) {
		console.log('failed to switch apps.. continue using this one');
		const docFailed = await AlternativeModel.findOne().exec();
		// const falseBooleanFailed = !docFailed.alternativeApp;
		await AlternativeModel.findOneAndUpdate(docFailed.alternativeApp, {
			alternativeApp: !docFailed.alternativeApp
		}).exec();
	}
}

module.exports = app;
