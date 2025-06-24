import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "react-native-paper";
import { alertAndLog } from "../../utils/alertAndLog";
import { Text, StyleSheet, View } from "react-native";
import { useAbly } from "../../utils/AblyProvider";
import NfcManager, {NfcTech} from 'react-native-nfc-manager';
import { HCESession, NFCTagType4NDEFContentType, NFCTagType4 } from 'react-native-hce';
import { v4 as uuidv4 } from 'uuid';

export function HandshakeStart() {
  const [authorizationInProgress, setAuthorizationInProgress] = useState(false);
  const [hceSession, setHceSession] = useState<HCESession | null>(null);
  const { ablyClient, getChannel, channels } = useAbly();
  
  // Use refs to track the latest values for use in callbacks
  const channelsRef = useRef(channels);
  const hceSessionRef = useRef<HCESession | null>(null);
  
  // Keep the refs updated with the latest values
  useEffect(() => {
    channelsRef.current = channels;
    console.log('Channels updated:', Object.keys(channels).length);
  }, [channels]);
  
  useEffect(() => {
    hceSessionRef.current = hceSession;
    console.log('HCE session updated:', hceSession ? 'active' : 'null');
  }, [hceSession]);

  async function readNdef() {
    let channelName = "";

    try {
      // register for the NFC tag with NDEF in it
      await NfcManager.requestTechnology(NfcTech.Ndef);

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
    }

    return channelName;
  }

  const stopHCESession = async () => {
    // Use the ref to get the current session
    const currentSession = hceSessionRef.current;
    console.log("Stopping HCE session: ", currentSession);
    
    if (currentSession) {
      try {
        await currentSession.setEnabled(false);
        console.warn('Session stopped successfully');
      } catch (error) {
        console.error('Error stopping HCE session:', error);
      } finally {
        setHceSession(null);
      }
    } else {
      console.warn('No active HCE session to stop');
    }
  }

  const startHCESession = async (channelName: string) => {
    const tag = new NFCTagType4({
      type: NFCTagType4NDEFContentType.Text,
      content: channelName,
      writable: false
    });

    let session = await HCESession.getInstance();
    session.setApplication(tag);
    await session.setEnabled(true);
    setHceSession(session);
    console.warn('Session started');

    session.on(HCESession.Events.HCE_STATE_READ, () => {
      console.log("The tag has been read!");
      const channel = getChannel(channelName);
      console.log(`Connected to channel: ${channelName}`);
      stopHCESession();
      setAuthorizationInProgress(false);
    });
  }

  const handleHandshakePress = useCallback(async () => {
    try {
      if (authorizationInProgress) {
        return;
      }
      setAuthorizationInProgress(true);

      const generatedChannelName = uuidv4();
      await startHCESession(generatedChannelName);

      const intervalDelay = 3000 + Math.floor(Math.random() * 3000);
      let isScanning = false;
      let shouldContinue = true;
      let scanTimeoutId: NodeJS.Timeout | null = null;
      let pauseTimeoutId: NodeJS.Timeout | null = null;

      // Function to stop all scanning activities
      const stopScanning = () => {
        shouldContinue = false;
        
        // Clear any pending timeouts
        if (scanTimeoutId) clearTimeout(scanTimeoutId);
        if (pauseTimeoutId) clearTimeout(pauseTimeoutId);
        
        // Cancel NFC request if currently scanning
        if (isScanning) {
          NfcManager.cancelTechnologyRequest().catch(() => {});
          isScanning = false;
        }
        
        console.log('NFC scanning stopped');
      };

      // Function to perform a scan
      const performScan = async () => {
        if (!shouldContinue || isScanning) return;
        
        try {
          // Mark as scanning
          isScanning = true;
          console.log('Starting NFC scan');
          
          // Set a timeout to force-end the scan after the interval period
          scanTimeoutId = setTimeout(() => {
            if (isScanning) {
              console.log('Scan timeout reached, cancelling scan');
              NfcManager.cancelTechnologyRequest().catch(() => {
                console.log('Failed to cancel NFC scan');
              });
              isScanning = false;
              
              // Start pause period after scan completes/times out
              if (shouldContinue) {
                console.log(`Pausing for ${intervalDelay}ms before next scan`);
                pauseTimeoutId = setTimeout(performScan, intervalDelay);
              }
            }
          }, intervalDelay);
          
          // Attempt to read NFC
          const receivedChannelName = await readNdef();
          
          // Clear the scan timeout since scan completed naturally
          if (scanTimeoutId) {
            clearTimeout(scanTimeoutId);
            scanTimeoutId = null;
          }
          
          // If successful, connect to the channel and stop scanning
          if (receivedChannelName) {
            const channel = getChannel(receivedChannelName);
            console.log(`Connected to channel: ${receivedChannelName}`);
            stopScanning();
            stopHCESession();
            setAuthorizationInProgress(false);
            return;
          }
          
          // Scan completed without finding a tag, start pause period
          isScanning = false;
          if (shouldContinue) {
            console.log(`Scan completed. Pausing for ${intervalDelay}ms before next scan`);
            pauseTimeoutId = setTimeout(performScan, intervalDelay);
          }
          
        } catch (error) {
          console.log('Error during NFC scan:', error);
          isScanning = false;
          
          // Start pause period after scan error
          if (shouldContinue) {
            console.log(`Scan error. Pausing for ${intervalDelay}ms before next scan`);
            pauseTimeoutId = setTimeout(performScan, intervalDelay);
          }
        }
      };

      // Start the first scan cycle
      performScan();
      
      // Check periodically if a channel has been established
      const channelCheckInterval = setInterval(() => {
        // Use the ref to get the current channels
        const currentChannels = channelsRef.current;
        console.log('Channel check:', Object.keys(currentChannels).length);
        
        if (Object.keys(currentChannels).length > 0) {
          console.log('Channel established, stopping scan cycles');
          stopScanning();
          stopHCESession();
          clearInterval(channelCheckInterval);
          setAuthorizationInProgress(false);
        }
      }, 1000); // Check every second
      
    } catch (err: any) {
      alertAndLog(
        "Error during handshake",
        err instanceof Error ? err.message : err
      );
    }
  }, [authorizationInProgress, channels]);

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