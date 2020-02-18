const mongoose = require('mongoose');

const schema = {
	// _id: {type: String, select:false},
	// __v: {type: Number, select: false},
	price: Number,
	side: String,
	size: Number
};

function getCurrentHourCollection() {
	const date = new Date();
	// TODO switch back
	date.setHours(date.getHours(), 0, 0, 0);
	
	// date.setHours(date.getHours(), date.getMinutes(), 0, 0);
	const modelName = 'pv_' + (date / 1000);
	// console.log('modelName > ' + mongoose.modelNames());

	return mongoose.modelNames().includes(modelName) ? mongoose.model(modelName) : mongoose.model(modelName, schema);
}

function getPastHourCollection(hoursPassed) {
	const date = new Date();
	// TODO swithc back
	date.setHours(date.getHours(), 0, 0, 0);
	const timestamp = date / 1000 - hoursPassed * 60 * 60;
	
	// date.setHours(date.getHours(), date.getMinutes(), 0,0);
	// const timestamp = date / 1000 - hoursPassed * 60;
	const modelName = 'pv_' + timestamp;
	return mongoose.modelNames().includes(modelName) ? mongoose.model(modelName) : mongoose.model(modelName, schema);
	// return mongoose.model(`price_volume_${timestamp}`, schema);
}

function getSchema() {
	return schema;
}

module.exports = {
	getCurrentHourCollection,
	getPastHourCollection,
	getSchema
};

// {
//     "timestamp": "2020-02-12T14:17:42.561Z",
//     "symbol": "XBTUSD",
//     "side": "Buy",
//     "size": 2000,
//     "price": 10361.5,
//     "tickDirection": "PlusTick",
//     "trdMatchID": "b5091289-22c9-0ab8-4a29-6c695e5a1d65",
//     "grossValue": 19302000,
//     "homeNotional": 0.19302,
//     "foreignNotional": 2000
//   }
