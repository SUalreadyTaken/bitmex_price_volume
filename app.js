const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cors = require('cors');
const request = require('request');
const sleep = require('util').promisify(setTimeout);
const fetch = require('node-fetch');

const bitmexService = require(`${__dirname}/services/bitmexService.js`);
const { AlternativeModel } = require(`${__dirname}/models/alternative.js`);
const priceVolumeController = require(`${__dirname}/controllers/priceVolumeController.js`);

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

app.use(limiter);
app.use('/pricevolume', priceVolumeController);
let alternativeBoolean = undefined;

if (process.env.USE_ALTERNATIVE_APPS) {
	getAlternativeBoolean();
	// // ping heroku app so it doesn't fall asleep
	setInterval(() => bitmexService.requestData(alternativeBoolean), 100);
	setInterval(() => {
		// main app
		// if (alternativeBoolean) request(process.env.HEROKU_URL + 'pricevolume/');
		// FIXME alternative app
		if (!alternativeBoolean && alternativeBoolean != undefined) request(process.env.HEROKU_URL + 'pricevolume/');
	}, 240000);
} else {
	setInterval(() => bitmexService.requestData(false), 150);
	setInterval(() => request(process.env.HEROKU_URL + 'pricevolume/'), 240000);
}

async function getAlternativeBoolean() {
	const doc = await AlternativeModel.findOne().exec();
	alternativeBoolean = !doc.alternativeApp;
	// FIXME if alternative change to !alternativeBoolean
	if (!alternativeBoolean) {
		if (doc.switchTime == undefined) {
			await AlternativeModel.deleteOne(doc);
			const switchIn = Date.now() + parseInt(process.env.SWITCH_TIME_MILLIS);
			const correctAlternative = new AlternativeModel({
				alternativeApp: doc.alternativeApp,
				switchTime: switchIn
			});
			await correctAlternative.save();
			setInterval(() => {
				switchToAlternative();
			}, process.env.SWITCH_TIME_MILLIS);
		} else {
			const switchIn = doc.switchTime - Date.now();
			console.log(`switching to alternative in ${switchIn} milliseconds`);
			switchIn < 60000
				? setInterval(() => switchToAlternative(), 60000)
				: setInterval(() => switchToAlternative(), switchIn);
		}
	}
}

async function switchToAlternative() {
	console.log('SWITCHING APPS');
	// FIXME alternative app switch to !alternativeBoolean
	if (!alternativeBoolean) {
		let status200 = false;
		const switchIn = Date.now() + parseInt(process.env.SWITCH_TIME_MILLIS);
		alternativeBoolean = !alternativeBoolean;
		await AlternativeModel.findOneAndUpdate(
			{ alternativeApp: alternativeBoolean },
			{ alternativeApp: !alternativeBoolean, switchTime: switchIn }
		).exec();
		for (let i = 0; i < 48; i++) {
			console.error('alternative app still isnt awake');
			const response = await fetch(process.env.HEROKU_URL_ALTERNATIVE + 'pricevolume/1h/seperated/1');
			if (response.ok) {
				status200 = !status200;
				console.log('alternative app is awake');
				break;
			}
			await sleep(5000);
		}
		if (!status200) {
			console.log('failed to switch apps.. continue using this one');
			alternativeBoolean = !alternativeBoolean;
			await AlternativeModel.findOneAndUpdate(
				{ alternativeApp: alternativeBoolean },
				{ alternativeApp: !alternativeBoolean }
			).exec();
		}
	}
}

module.exports = app;
