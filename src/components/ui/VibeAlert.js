import { Platform, Alert } from 'react-native';

export default function VibeAlert(title, message, buttons = []) {
  console.log(`>>> SYSTEM: ${title} | ${message}`);
  
  const cyberpunkTitle = `>>> ${title.toUpperCase()}`;
  const cyberpunkMessage = `[SYSTEM] ${message}`;
  
  if (Platform.OS === 'web') {
    window.alert(`${cyberpunkTitle}\n${cyberpunkMessage}`);
  } else {
    const cyberpunkButtons = buttons.length > 0 ? buttons.map(btn => ({
      ...btn,
      text: btn.text ? `[${btn.text.toUpperCase()}]` : btn.text
    })) : undefined;
    
    Alert.alert(cyberpunkTitle, cyberpunkMessage, cyberpunkButtons);
  }
}

export function VibeConfirm(title, message, onConfirm, onCancel) {
  return VibeAlert(title, message, [
    {
      text: 'CANCEL',
      style: 'cancel',
      onPress: onCancel
    },
    {
      text: 'CONFIRM',
      onPress: onConfirm
    }
  ]);
}
