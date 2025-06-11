import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from "react-native";
import { Text, Button } from "react-native-paper";
import { useAuthorization } from "../utils/useAuthorization";
import NfcManager, {NfcTech} from 'react-native-nfc-manager';
import { HCESession, NFCTagType4NDEFContentType, NFCTagType4 } from 'react-native-hce';
const Ably = require('ably');

NfcManager.start();

export default function BlankScreen() {
  const { selectedAccount } = useAuthorization();
  const [readerSessionActive, setReaderSessionActive] = useState<boolean>(false);
  const [hceSession, setHceSession] = useState<HCESession | null>(null);
  const [ablySession, setAblySession] = useState<any>(null);

  async function readNdef() {
    try {
      // register for the NFC tag with NDEF in it
      await NfcManager.requestTechnology(NfcTech.Ndef);
      setReaderSessionActive(true);
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
            
            const ably = new Ably.Realtime("JkXk4g.oaE-7A:Mg0FcpPLSHWOc208f7-tdHsG8zxEDoDGlyCWqlDmeoo");
            setAblySession(ably);
            ably.connection.once("connected", () => {
              console.log("Connected to Ably!");
            });

            const channel = ably.channels.get(trimmedString);
            await channel.subscribe("announcement", (message: any) => {
              console.log("Announcement received: " + message.data);
            });
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
      setReaderSessionActive(false);
    }
  }

  const startSession = async () => {
    const tag = new NFCTagType4({
      type: NFCTagType4NDEFContentType.Text,
      content: "Hello world",
      writable: false
    });
  
    let session = await HCESession.getInstance();
    session.setApplication(tag);
    await session.setEnabled(true);
    console.warn('Session started');
    setHceSession(session);
  }

  const stopSession = async () => {
    if (hceSession) {
      await hceSession.setEnabled(false);
      console.warn('Session stopped');
      setHceSession(null);
    }
  }

  return (
    <View style={styles.wrapper}>
      {/* <TouchableOpacity onPress={readNdef}>
        <Text>Scan a Tag</Text>
      </TouchableOpacity> */}
      <Button
        mode="outlined"
        disabled={hceSession !== null}
        onPress={startSession}
        style={{ marginBottom: 40 }}
      >
        Connect As Card
      </Button>
      <Button
        mode="outlined"
        disabled={readerSessionActive}
        onPress={readNdef}
        style={{ }}
      >
        Connect As Reader
      </Button>
    </View>
  );

  // return (
  //   <>
  //     <View style={styles.screenContainer}>
  //       {selectedAccount ? (
  //         <NFTData address={selectedAccount.publicKey} />
  //       ) : (
  //         <Text variant="titleLarge">No account selected</Text>
  //       )}
  //     </View>
  //   </>
  // );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
