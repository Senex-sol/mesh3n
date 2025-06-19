import { View, StyleSheet } from "react-native";
import { HandshakeStart } from "./handshake-ui";

export function HandshakeFeature() {
  return (
    <>
      <View style={styles.buttonGroup}>
        <HandshakeStart />
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
