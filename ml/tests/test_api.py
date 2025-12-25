"""
Tests for Flask API endpoints.
"""
import pytest
import json
import numpy as np


@pytest.fixture(scope="module")
def app():
    """Create Flask test client."""
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    from ml.serve import app, load_model
    load_model()

    app.config['TESTING'] = True
    return app


@pytest.fixture(scope="module")
def client(app):
    """Flask test client."""
    return app.test_client()


class TestHealthEndpoint:
    """Test /health endpoint."""

    def test_health_returns_200(self, client):
        """Health endpoint should return 200."""
        response = client.get('/health')
        assert response.status_code == 200

    def test_health_returns_json(self, client):
        """Health endpoint should return JSON."""
        response = client.get('/health')
        data = json.loads(response.data)
        assert 'status' in data
        assert data['status'] == 'ok'

    def test_health_shows_model_loaded(self, client):
        """Health should indicate model is loaded."""
        response = client.get('/health')
        data = json.loads(response.data)
        assert data['model_loaded'] is True


class TestPredictEndpoint:
    """Test /predict endpoint."""

    def test_predict_valid_input(self, client, sample_signal, sample_age_days):
        """Predict should work with valid input."""
        response = client.post('/predict',
            data=json.dumps({
                'signal': sample_signal.tolist(),
                'age_days': sample_age_days,
                'sample_rate': 500
            }),
            content_type='application/json'
        )
        assert response.status_code == 200

    def test_predict_returns_predictions(self, client, sample_signal, sample_age_days):
        """Predict should return predictions array."""
        response = client.post('/predict',
            data=json.dumps({
                'signal': sample_signal.tolist(),
                'age_days': sample_age_days
            }),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert 'predictions' in data
        assert len(data['predictions']) == 3  # CHD, Kawasaki, Cardiomyopathy (not Myocarditis)

    def test_predict_probability_range(self, client, sample_signal, sample_age_days):
        """Probabilities should be in [0, 1]."""
        response = client.post('/predict',
            data=json.dumps({
                'signal': sample_signal.tolist(),
                'age_days': sample_age_days
            }),
            content_type='application/json'
        )
        data = json.loads(response.data)

        for pred in data['predictions']:
            assert 0 <= pred['probability'] <= 1, f"{pred['condition']} probability out of range"
            assert 'threshold' in pred
            assert 'positive' in pred

    def test_predict_neonate_warning(self, client, sample_signal):
        """Neonates should get warning."""
        response = client.post('/predict',
            data=json.dumps({
                'signal': sample_signal.tolist(),
                'age_days': 14  # 2 weeks old
            }),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert 'warnings' in data
        warning_messages = [w['message'] for w in data['warnings']]
        assert any('Neonatal' in m or 'neonatal' in m for m in warning_messages)

    def test_predict_9lead_warning(self, client, sample_signal, sample_age_days, sample_9lead_mask):
        """9-lead ECG should get warning."""
        response = client.post('/predict',
            data=json.dumps({
                'signal': sample_signal.tolist(),
                'age_days': sample_age_days,
                'lead_mask': sample_9lead_mask
            }),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert 'warnings' in data
        warning_messages = [w['message'] for w in data['warnings']]
        assert any('9-lead' in m for m in warning_messages)

    def test_predict_wrong_leads_error(self, client, sample_age_days):
        """Wrong number of leads should error."""
        bad_signal = np.random.randn(6, 5000).tolist()  # Only 6 leads

        response = client.post('/predict',
            data=json.dumps({
                'signal': bad_signal,
                'age_days': sample_age_days
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data

    def test_predict_model_info(self, client, sample_signal, sample_age_days):
        """Response should include model info."""
        response = client.post('/predict',
            data=json.dumps({
                'signal': sample_signal.tolist(),
                'age_days': sample_age_days
            }),
            content_type='application/json'
        )
        data = json.loads(response.data)

        assert 'model_info' in data
        assert 'version' in data['model_info']
        assert 'conditions' in data['model_info']
