const axios = require('axios');

// Configuration for APIs
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAPBOX_API_KEY = process.env.MAPBOX_API_KEY;
const HERE_API_KEY = process.env.HERE_API_KEY;

// Geocode address to get coordinates
async function geocodeAddress(address) {
  try {
    // Try Google Maps Geocoding API first
    if (GOOGLE_MAPS_API_KEY) {
      return await geocodeWithGoogle(address);
    }
    
    // Try Mapbox Geocoding API
    if (MAPBOX_API_KEY) {
      return await geocodeWithMapbox(address);
    }
    
    // Try HERE Geocoding API
    if (HERE_API_KEY) {
      return await geocodeWithHere(address);
    }
    
    console.warn('No geocoding API key configured');
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

// Google Maps Geocoding API
async function geocodeWithGoogle(address) {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY
      }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng
      };
    }
    return null;
  } catch (error) {
    console.error('Google Geocoding error:', error);
    return null;
  }
}

// Mapbox Geocoding API
async function geocodeWithMapbox(address) {
  try {
    const response = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`, {
      params: {
        access_token: MAPBOX_API_KEY,
        country: 'US' // Limit to US for better results
      }
    });
    
    if (response.data.features && response.data.features.length > 0) {
      const coordinates = response.data.features[0].center;
      return {
        lat: coordinates[1],
        lng: coordinates[0]
      };
    }
    return null;
  } catch (error) {
    console.error('Mapbox Geocoding error:', error);
    return null;
  }
}

// HERE Geocoding API
async function geocodeWithHere(address) {
  try {
    const response = await axios.get('https://geocode.search.hereapi.com/v1/geocode', {
      params: {
        q: address,
        apiKey: HERE_API_KEY,
        countryCode: 'USA'
      }
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const position = response.data.items[0].position;
      return {
        lat: position.lat,
        lng: position.lng
      };
    }
    return null;
  } catch (error) {
    console.error('HERE Geocoding error:', error);
    return null;
  }
}

// Calculate distance using Distance Matrix API
async function calculateDistanceMatrix(origin, destinations) {
  try {
    // Try Google Maps Distance Matrix API first
    if (GOOGLE_MAPS_API_KEY) {
      return await distanceMatrixWithGoogle(origin, destinations);
    }
    
    // Try Mapbox Distance Matrix API
    if (MAPBOX_API_KEY) {
      return await distanceMatrixWithMapbox(origin, destinations);
    }
    
    // Try HERE Distance Matrix API
    if (HERE_API_KEY) {
      return await distanceMatrixWithHere(origin, destinations);
    }
    
    console.warn('No distance matrix API key configured');
    return null;
  } catch (error) {
    console.error('Distance Matrix error:', error);
    return null;
  }
}

// Google Maps Distance Matrix API
async function distanceMatrixWithGoogle(origin, destinations) {
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
      params: {
        origins: origin,
        destinations: destinations.join('|'),
        key: GOOGLE_MAPS_API_KEY,
        units: 'metric'
      }
    });
    
    if (response.data.rows && response.data.rows[0].elements) {
      return response.data.rows[0].elements.map(element => ({
        distance: element.distance ? element.distance.value / 1000 : null, // Convert meters to kilometers
        duration: element.duration ? element.duration.value : null,
        status: element.status
      }));
    }
    return null;
  } catch (error) {
    console.error('Google Distance Matrix error:', error);
    return null;
  }
}

// Mapbox Distance Matrix API
async function distanceMatrixWithMapbox(origin, destinations) {
  try {
    const coordinates = [origin, ...destinations];
    const response = await axios.get(`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates.join(';')}`, {
      params: {
        access_token: MAPBOX_API_KEY,
        annotations: 'distance,duration'
      }
    });
    
    if (response.data.distances && response.data.durations) {
      return response.data.distances[0].slice(1).map((distance, index) => ({
        distance: distance / 1000, // Convert meters to kilometers
        duration: response.data.durations[0][index + 1],
        status: distance > 0 ? 'OK' : 'NOT_FOUND'
      }));
    }
    return null;
  } catch (error) {
    console.error('Mapbox Distance Matrix error:', error);
    return null;
  }
}

// HERE Distance Matrix API
async function distanceMatrixWithHere(origin, destinations) {
  try {
    const response = await axios.get('https://route.ls.hereapi.com/routing/v7/calculateisochrone.json', {
      params: {
        apiKey: HERE_API_KEY,
        origin: origin,
        range: '50000', // 50km max range
        mode: 'fastest;car'
      }
    });
    
    // HERE API has different structure, this is a simplified version
    // You might need to adjust based on your specific HERE API setup
    return null;
  } catch (error) {
    console.error('HERE Distance Matrix error:', error);
    return null;
  }
}

// Calculate distance using Haversine formula (fallback)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Format distance for display
function formatDistance(distance) {
  if (!distance) return 'Distance unknown';
  
  if (distance < 1) {
    return `${Math.round(distance * 1000)} meters`;
  } else if (distance < 10) {
    return `${distance.toFixed(1)} km`;
  } else {
    return `${Math.round(distance)} km`;
  }
}

module.exports = {
  geocodeAddress,
  calculateDistanceMatrix,
  calculateHaversineDistance,
  formatDistance
}; 