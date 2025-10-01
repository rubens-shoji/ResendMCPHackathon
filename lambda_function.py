import json
import urllib3

def lambda_handler(event, context):
    try:
        # Pega o valor do slot que agora está funcionando
        full_message = event['request']['intent']['slots']['SendAnythingIntent']['value']
        
        # Chama sua API
        http = urllib3.PoolManager()
        
        data = {
            'voice_input': f"send an email {full_message}"  # Reconstrói a frase completa
        }
        
        response = http.request('POST', 
            'https://f8a44dd093d6.ngrok-free.app/prompt',
            body=json.dumps(data),
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        if response.status == 200:
            result = json.loads(response.data.decode('utf-8'))
            speech_text = result.get('response', 'Email sent!')
        else:
            speech_text = f"Sorry, couldn't send the email. API returned {response.status}"
            
    except Exception as e:
        speech_text = f"There was an error: {str(e)}"
    
    return {
        'version': '1.0',
        'response': {
            'outputSpeech': {
                'type': 'PlainText',
                'text': speech_text
            }
        }
    }