import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isWithinGeofence: {
    type: Boolean,
    default: false
  }
});

export default mongoose.model('Location', locationSchema);