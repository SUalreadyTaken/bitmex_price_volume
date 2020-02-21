const mongoose = require('mongoose');

const schema = {
	price: Number,
	side: String,
    size: Number,
    timestamp: Number
};

function getCurrentDayCollectionModel() {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	const modelName = 'pv_' + (date / 1000);

	return mongoose.modelNames().includes(modelName) ? mongoose.model(modelName) : mongoose.model(modelName, schema);
}

function getPastDaysCollectionModel(daysPassed) {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	const timestamp = date / 1000 - daysPassed * 24 * 60 * 60;
    const modelName = 'pv_' + timestamp;
    
	return mongoose.modelNames().includes(modelName) ? mongoose.model(modelName) : mongoose.model(modelName, schema);
}

function getSchema() {
	return schema;
}

module.exports = {
	getCurrentDayCollectionModel,
	getPastDaysCollectionModel,
	getSchema
};