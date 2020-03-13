const priceVolume = require('./priceVolume.js');

class PseudoCache {
	constructor() {
		this.cache = [];
		const currentTime = new Date();
		this.currentHourTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
	}

	// get todays data excluding current hour
	async getTodaysCache() {
		let found = false;
		let result = [];
		const currentTime = new Date();
		const currentTimestamp = currentTime.setHours(currentTime.getHours(), 0, 0, 0) / 1000;
		const todaysTimestamp = new Date().setHours(0, 0, 0, 0) / 1000;
		if (this.currentHourTimestamp == currentTimestamp) {
			//still same hour
			for (let i = 0; i < this.cache.length; i++) {
				if (this.cache[i].timestamp == todaysTimestamp) {
					found = true;
					result = this.cache[i].data;
					break;
				}
			}
			// 1st query..
			if (!found) {
				console.log('1st query');
				const model = priceVolume.getCurrentDayCollectionModel();
				const todaysDataExCurrentHour = await model
					.find({ timestamp: { $lt: this.currentHourTimestamp } }, { _id: 0, __v: 0 })
					.lean()
					.exec();
				this.cache.push({ timestamp: model.modelName.split('_')[1], data: todaysDataExCurrentHour });
				result = todaysDataExCurrentHour;
			}
		} else {
			// check if day has changed
			const cacheTimestampDay = new Date(this.currentHourTimestamp * 1000).getDay();
			if (cacheTimestampDay !== currentTime.getDay()) {
				console.log('day has changed.. ' + currentTime);
				// day has changed
				// should be 00:xx new day.. heroku's ping will update todays cache constantly
				const model = priceVolume.getPastDaysCollectionModel(1);
				const yesterdaysData = await model
					.find({}, { _id: 0, __v: 0 })
					.lean()
					.exec();
				// timestamp has to be there
				const yesterdaysTimestamp = model.modelName.split('_')[1];
				for (let i = 0; i < this.cache.length; i++) {
					if (this.cache[i].timestamp == yesterdaysTimestamp) {
						this.cache[i].data = yesterdaysData;
						break;
					}
				}
				// if 00:xx return empty result
				if (currentTime.getHours() != 0) {
					// should never reach here
					const model = priceVolume.getCurrentDayCollectionModel();
					const todaysDataExCurrentHour = await model
						.find({ timestamp: { $lt: currentTimestamp } }, { _id: 0, __v: 0 })
						.lean()
						.exec();
					this.cache.push({ timestamp: model.modelName.split('_')[1], data: todaysDataExCurrentHour });
					result = todaysDataExCurrentHour;
				}
				this.currentHourTimestamp = currentTimestamp;
			} else {
				// still same day just new hour
				console.log('still same day just new hour');
				const todaysDataExCurrentHour = await priceVolume
					.getCurrentDayCollectionModel()
					.find({ timestamp: { $lt: currentTimestamp } }, { _id: 0, __v: 0 })
					.lean()
					.exec();
				for (let i = 0; i < this.cache.length; i++) {
					if (this.cache[i].timestamp == todaysTimestamp) {
						this.cache[i].data = todaysDataExCurrentHour;
					}
				}
				this.currentHourTimestamp = currentTimestamp;
				result = todaysDataExCurrentHour;
			}
		}

		return result;
	}

	async getDay(daysPassed) {
		let found = false;
		let result = [];

		const date = new Date().setHours(0, 0, 0, 0);
		const timestamp = date / 1000 - daysPassed * 24 * 60 * 60;

		for (let i = 0; i < this.cache.length; i++) {
			if (this.cache[i].timestamp == timestamp) {
				found = true;
				result = this.cache[i].data;
				break;
			}
		}

		if (!found) {
			const pastDaysCollection = await priceVolume
				.getPastDaysModel(timestamp)
				.find({}, { _id: 0, __v: 0 })
				.lean()
				.exec();
			this.cache.push({ timestamp: timestamp, data: pastDaysCollection });
			result = pastDaysCollection;
		}

		return result;
	}

	getCache() {
		return this.cache;
	}
}

module.exports = PseudoCache;
