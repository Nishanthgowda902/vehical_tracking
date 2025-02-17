import express from 'express';
import mqtt from 'mqtt';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import Location from './models/Location.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Geofence configurations for each vehicle
const geofences = {
  'vehicle-1': {
    center: { lat: 12.9716, lng: 77.5946 }, // Bangalore center
    radius: 5000 // 5km radius
  },
  'vehicle-2': {
    center: { lat: 12.9716, lng: 77.5946 }, // Bangalore center
    radius: 7000 // 7km radius
  }
};

// Function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Function to check if location is within geofence
function isWithinGeofence(vehicleId, latitude, longitude) {
  const geofence = geofences[vehicleId];
  if (!geofence) return true; // If no geofence defined, consider it within bounds

  const distance = calculateDistance(
    latitude,
    longitude,
    geofence.center.lat,
    geofence.center.lng
  );

  return distance <= geofence.radius;
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Connect to MQTT broker
const client = mqtt.connect(`mqtt://${process.env.MQTT_BROKER}`, {
  port: process.env.MQTT_PORT
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  
  // Subscribe to vehicle-specific topics
  const topics = ['GPS/location/1', 'GPS/location/2'];
  topics.forEach(topic => {
    client.subscribe(topic, (err) => {
      if (err) {
        console.error(`Error subscribing to ${topic}:`, err);
      } else {
        console.log(`Subscribed to ${topic}`);
      }
    });
  });
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const vehicleId = topic.includes('1') ? 'vehicle-1' : 'vehicle-2';

    // Check if location data is valid
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      const isInGeofence = isWithinGeofence(vehicleId, data.latitude, data.longitude);

      const location = new Location({
        vehicleId,
        latitude: data.latitude,
        longitude: data.longitude,
        isWithinGeofence: isInGeofence
      });

      await location.save();
      console.log('Location saved:', location);

      // If vehicle is outside geofence, publish alert
      if (!isInGeofence) {
        const alertTopic = `vehicle/${vehicleId}/alert`;
        const alertMessage = JSON.stringify({
          type: 'GEOFENCE_VIOLATION',
          message: `Vehicle has left the designated area`,
          timestamp: new Date().toISOString(),
          location: {
            latitude: data.latitude,
            longitude: data.longitude
          }
        });
        client.publish(alertTopic, alertMessage);
      }
    }
  } catch (error) {
    console.error('Error processing MQTT message:', error);
  }
});

// API endpoint to get the latest location for a specific vehicle
app.get('/api/location/latest/:vehicleId', async (req, res) => {
  try {
    const location = await Location.findOne({ vehicleId: req.params.vehicleId })
      .sort({ timestamp: -1 });
    res.json(location);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching location data' });
  }
});

// API endpoint to get location history for a specific vehicle
app.get('/api/location/history/:vehicleId', async (req, res) => {
  try {
    const locations = await Location.find({ vehicleId: req.params.vehicleId })
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching location history' });
  }
});

// API endpoint to get geofence status
app.get('/api/geofence/:vehicleId', async (req, res) => {
  try {
    const location = await Location.findOne({ vehicleId: req.params.vehicleId })
      .sort({ timestamp: -1 });
    
    if (!location) {
      return res.status(404).json({ error: 'No location data found' });
    }

    res.json({
      vehicleId: req.params.vehicleId,
      isWithinGeofence: location.isWithinGeofence,
      lastLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: location.timestamp
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching geofence status' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});