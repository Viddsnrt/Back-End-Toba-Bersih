import axios from 'axios';

async function testAPI() {
  try {
    console.log('Testing GET /api/posts...');
    const response = await axios.get('http://localhost:5000/api/posts');
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }

  try {
    console.log('Testing POST /api/posts without auth...');
    const response = await axios.post('http://localhost:5000/api/posts', {
      title: 'Test Post',
      content: 'Test content',
      category: 'BERITA',
      slug: 'test-post'
    });
    console.log('Success:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testAPI();