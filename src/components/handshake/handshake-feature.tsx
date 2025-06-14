import { View, StyleSheet } from "react-native";
import { HandshakeButton } from "./handshake-ui";

export function HandshakeFeature() {
  return (
    <>
      <View style={styles.buttonGroup}>
        <HandshakeButton />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  buttonGroup: {
    marginTop: 16,
    flexDirection: "row",
  },
});
