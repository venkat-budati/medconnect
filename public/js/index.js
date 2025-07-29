// Form validation and basic interactivity
document.addEventListener('DOMContentLoaded', function() {
    // Form validation for register and login
    const validateForm = (formId) => {
        const form = document.getElementById(formId);
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            let isValid = true;
            const inputs = form.querySelectorAll('input[required]');
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    showError(input, 'This field is required');
                } else {
                    clearError(input);
                    
                    // Additional validations
                    if (input.type === 'email' && !validateEmail(input.value)) {
                        isValid = false;
                        showError(input, 'Please enter a valid email');
                    }
                    
                    if (input.type === 'password' && input.value.length < 6) {
                        isValid = false;
                        showError(input, 'Password must be at least 6 characters');
                    }
                    
                    if (input.id === 'confirmPassword' && input.value !== document.getElementById('password').value) {
                        isValid = false;
                        showError(input, 'Passwords do not match');
                    }
                }
            });
            
            if (!isValid) e.preventDefault();
        });
    };
    
    // Validate donation form
    const donationForm = document.getElementById('donate-form');
    if (donationForm) {
        donationForm.addEventListener('submit', function(e) {
            const expiryInput = document.getElementById('expiryDate');
            const expiryDate = new Date(expiryInput.value);
            const today = new Date();
            
            if (expiryDate < today) {
                e.preventDefault();
                showError(expiryInput, 'Expiry date must be in the future');
            }
        });
    }
    
    // Image preview for donation form
    const imageInput = document.getElementById('medicineImage');
    if (imageInput) {
        imageInput.addEventListener('change', function() {
            const preview = document.getElementById('imagePreview');
            const file = this.files[0];
            
            if (file) {
                const reader = new FileReader();
                
                reader.addEventListener('load', function() {
                    preview.innerHTML = `<img src="${this.result}" alt="Preview" style="max-width: 100%; max-height: 200px; margin-top: 10px;">`;
                });
                
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Initialize form validations
    validateForm('register-form');
    validateForm('login-form');
    
    // Helper functions
    function showError(input, message) {
        const formGroup = input.closest('.form-group');
        let error = formGroup.querySelector('.error-message');
        
        if (!error) {
            error = document.createElement('div');
            error.className = 'error-message';
            formGroup.appendChild(error);
        }
        
        error.textContent = message;
        error.style.display = 'block';
        input.style.borderColor = '#dc3545';
    }
    
    function clearError(input) {
        const formGroup = input.closest('.form-group');
        const error = formGroup.querySelector('.error-message');
        
        if (error) {
            error.style.display = 'none';
            input.style.borderColor = '#ddd';
        }
    }
    
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
});