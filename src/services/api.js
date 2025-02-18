import mqtt from 'precompiled-mqtt';

const API_BASE_URL = 'http://localhost:3001/api';

export const getLatestLocation = async (vehicleId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/location/latest/${vehicleId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data) {
      throw new Error('No location data available');
    }
    return data;
  } catch (error) {
    console.error('Error fetching latest location:', error);
    throw error;
  }
};

export const getLocationHistory = async (vehicleId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/location/history/${vehicleId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data) {
      throw new Error('No location history available');
    }
    return data;
  } catch (error) {
    console.error('Error fetching location history:', error);
    throw error;
  }
};

export const publishVehicleStatus = async (vehicleId, isOn) => {
  try {
    const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');
    
    return new Promise((resolve, reject) => {
      client.on('connect', () => {
        const message = JSON.stringify({ 
          status: isOn ? 'ON' : 'OFF',
          vehicleId: vehicleId,
          timestamp: new Date().toISOString()
        });

        const topic = `vehicle/${vehicleId}/status`;
        
        client.publish(topic, message, (err) => {
          client.end();
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      client.on('error', (err) => {
        client.end();
        reject(err);
      });

      setTimeout(() => {
        client.end();
        reject(new Error('MQTT connection timeout'));
      }, 5000);
    });
  } catch (error) {
    console.error('Error publishing vehicle status:', error);
    throw error;
  }
};

export const subscribeToVehicleUpdates = (vehicle, onMessage) => {
  // Only subscribe for default vehicles (vehicle-1 and vehicle-2)
  if (vehicle.isCustom) {
    return () => {}; // Return empty cleanup function for custom vehicles
  }

  const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');
  
  client.on('connect', () => {
    let topic;
    
    // Set topic based on vehicle ID
    if (vehicle.id === 'vehicle-1') {
      topic = 'GPS/location/1';
    } else if (vehicle.id === 'vehicle-2') {
      topic = 'GPS/location/2';
    }

    if (topic) {
      client.subscribe(topic, (err) => {
        if (err) {
          console.error(`Error subscribing to ${topic}:`, err);
        } else {
          console.log(`Subscribed to ${topic}`);
        }
      });
    }
  });

  client.on('message', (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      onMessage(data);
    } catch (error) {
      console.error('Error processing MQTT message:', error);
    }
  });

  client.on('error', (error) => {
    console.error('MQTT client error:', error);
  });

  return () => {
    client.end();
  };
};
