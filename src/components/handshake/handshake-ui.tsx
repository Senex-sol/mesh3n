import { useState, useCallback } from "react";
import { Button } from "react-native-paper";
import { alertAndLog } from "../../utils/alertAndLog";
import { Text, StyleSheet, View } from "react-native";
import { useAbly } from "../../utils/AblyProvider";
import NfcManager, {NfcTech} from 'react-native-nfc-manager';

export function HandshakeStart() {
  const [authorizationInProgress, setAuthorizationInProgress] = useState(false);
  const { ablyClient, getChannel, channels } = useAbly();

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
          }
        } catch (e) {
          console.error('Error decoding payload with String.fromCharCode:', e, firstNdefRecord.payload);
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
    <>
      {Object.keys(channels).length > 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.titleText}>Handshake Connecting</Text>
          <Text style={styles.detailText}>Establishing a connection with other device.</Text>
        </View>
      ) : authorizationInProgress ? (
        <View style={styles.centerContainer}>
          <Text style={styles.titleText}>Handshake Active</Text>
          <Text style={styles.detailText}>Hold the back of your phone against the back of the other phone.</Text>
        </View>
      ) : (
        <>
          <Button
            mode="contained"
            disabled={authorizationInProgress}
            onPress={handleHandshakePress}
            style={{ flex: 1 }}
          >
            Start Handshake
          </Button>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 18,
    marginBottom: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  detailText: {
    fontSize: 16,
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
});