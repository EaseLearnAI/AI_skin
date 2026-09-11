const mongoose = require('mongoose');

// One logical calendar day per plan. Timezone aliases cannot create duplicate days.
const dailyRoutineSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  date: { type: String, required: true },
  timezone: { type: String, required: true },
  steps: { type: Map, of: Boolean, default: {} }
}, { timestamps: true });
dailyRoutineSchema.index({ createdBy: 1, planId: 1, date: 1 }, { unique: true });
module.exports = mongoose.models.DailyRoutine || mongoose.model('DailyRoutine', dailyRoutineSchema);
