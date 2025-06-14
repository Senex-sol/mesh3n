import { useState, useCallback } from "react";
import { Button } from "react-native-paper";
import { alertAndLog } from "../../utils/alertAndLog";
import { useAbly } from "../../utils/AblyProvider";
import NfcManager, {NfcTech} from 'react-native-nfc-manager';

export function HandshakeButton() {
  const [authorizationInProgress, setAuthorizationInProgress] = useState(false);
  const { ablyClient, getChannel } = useAbly();

  async function readNdef() {
    let channelName = "";

    try {
      // register for the NFC tag with NDEF in it
      await NfcManager.requestTechnology(NfcTech.Ndef);
    //   setReaderSessionActive(true);
      // the resolved tag object will contain `ndefMessage` property
      const tag = await NfcManager.getTag();
      console.warn('Tag found', tag);

      const firstNdefRecord = tag?.ndefMessage?.[0];
      if (firstNdefRecord && firstNdefRecord.payload && firstNdefRecord.payload.length > 0) {
        try {
          // Assuming payload is an array of character codes (number[])
          let decodedString = String.fromCharCode(...firstNdefRecord.payload);
          console.warn('Original Decoded NDEF Record Payload:', decodedString);

          if (decodedString.length > 3) {
            const trimmedString = decodedString.substring(3);
            console.warn('Trimmed NDEF Record Payload:', trimmedString);
            channelName = trimmedString;

          } else {
            console.warn('Decoded string is too short to trim first 3 characters. Using original:', decodedString);
            // Handle the case where the string is too short, if necessary
          }
          // If you intend to use the trimmed version universally, reassign it:
          // if (decodedString.length > 3) decodedString = decodedString.substring(3);
        } catch (e) {
          console.error('Error decoding payload with String.fromCharCode:', e, firstNdefRecord.payload);
          // Fallback or alternative decoding if needed, e.g., TextDecoder for specific encodings
          // For example, for UTF-8: 
          // try {
          //   const textDecoder = new TextDecoder('utf-8');
          //   const decodedStringUtf8 = textDecoder.decode(Uint8Array.from(firstNdefRecord.payload));
          //   console.warn('Decoded NDEF Record Payload (UTF-8):', decodedStringUtf8);
          // } catch (utf8Error) {
          //   console.error('Error decoding payload as UTF-8:', utf8Error);
          // }
        }
      } else {
        console.warn('No NDEF message with a valid payload found in the first record.');
      }
    } catch (ex) {
      console.warn('Oops!', ex);
    } finally {
      // stop the nfc scanning
      NfcManager.cancelTechnologyRequest();
    //   setReaderSessionActive(false);
    }

    return channelName;
  }

  const handleHandshakePress = useCallback(async () => {
    try {
      if (authorizationInProgress) {
        return;
      }
      setAuthorizationInProgress(true);
      const channelName = await readNdef();
      if (channelName) {
        const channel = getChannel(channelName);
        console.log(`Connected to channel: ${channelName}`);
        // Now you can use the channel for communication
      }
      
    } catch (err: any) {
      alertAndLog(
        "Error during handshake",
        err instanceof Error ? err.message : err
      );
    } finally {
      setAuthorizationInProgress(false);
    }
  }, [authorizationInProgress]);
  return (
    <Button
      mode="contained"
      disabled={authorizationInProgress}
      onPress={handleHandshakePress}
      style={{ flex: 1 }}
    >
      Handshake
    </Button>
  );
}
