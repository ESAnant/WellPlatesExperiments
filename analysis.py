import numpy as np
from scipy.optimize import curve_fit
import json

def four_parameter_logistic(x, bottom, top, hill_slope, ic50):
    """ 4PL / Hill-Sigmoid Equation """
    return bottom + (top - bottom) / (1 + (x / ic50)**hill_slope)

def analyze_dose_response_py(concentrations_json, responses_json):
    try:
        concentrations = np.array(json.loads(concentrations_json))
        responses = np.array(json.loads(responses_json))

        # Remove non-positive concentrations for log-scale fitting
        mask = concentrations > 0
        concentrations = concentrations[mask]
        responses = responses[mask]

        if len(concentrations) < 4:
            return json.dumps({"success": False, "error": "At least 4 data points are required for a 4PL fit."})

        # Provide initial guesses for the parameters
        bottom_guess = np.min(responses)
        top_guess = np.max(responses)
        ic50_guess = np.median(concentrations)
        hill_slope_guess = 1.0 # Standard slope

        initial_guesses = [bottom_guess, top_guess, hill_slope_guess, ic50_guess]
        
        # Define bounds to constrain the fit
        bounds = ([-np.inf, -np.inf, -100, 0], [np.inf, np.inf, 100, np.inf])

        # Perform the curve fit
        params, covariance = curve_fit(
            four_parameter_logistic, 
            concentrations, 
            responses, 
            p0=initial_guesses, 
            bounds=bounds, 
            maxfev=10000 # Increase iterations for difficult fits
        )

        # Extract parameters
        bottom, top, hill_slope, ic50 = params

        # Ensure top is greater than bottom
        if top < bottom:
            top, bottom = bottom, top
            
        result = {
            "ic50": ic50,
            "hillSlope": hill_slope,
            "top": top,
            "bottom": bottom,
            "success": True
        }
        return json.dumps(result)

    except Exception as e:
        result = {
            "error": str(e),
            "success": False
        }
        return json.dumps(result)
