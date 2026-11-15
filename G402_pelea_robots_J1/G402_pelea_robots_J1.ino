
#include <Servo.h>
#include <Ethernet.h>
#include <MQTT.h>

const int pinX = A0; // eje X Base
const int pinY = A1; // eje Y Brazo escudo
int servBASE = 5;    // Base
int servBA = 13;     // brazo ataque
int servBE = 12;     // escudo
int Boton = 8;
int cont = 0;
const int pinSensor = 2;
const int pinLED = 9;
Servo base;
Servo brazo1;
Servo brazo2;
int EstadoBoton=0;


// REDES
const char mqtt_broker[] = "broker.emqx.io";
String TopicoSalida = "G402/Robot";
String jugador = "J1";
char ipBuffer[16];
byte mac[] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF};

EthernetClient net;
MQTTClient client;


void ConectarRed(){
  // start the Ethernet connection:
  Serial.println("Initialize Ethernet with DHCP:");
  if (Ethernet.begin(mac) == 0) {
    Serial.println("Failed to configure Ethernet using DHCP");
    // Check for Ethernet hardware present
    if (Ethernet.hardwareStatus() == EthernetNoHardware) {
      Serial.println("Ethernet shield was not found.  Sorry, can't run without hardware. :(");
      while (true) {
        delay(1); // do nothing, no point running without Ethernet hardware
      }
    }
    if (Ethernet.linkStatus() == LinkOFF) {
      Serial.println("Ethernet cable is not connected.");
    }

  } else {
    Serial.print("  DHCP assigned IP ");
    Serial.println(Ethernet.localIP());
    Serial.println(Ethernet.dnsServerIP());
    Serial.println(Ethernet.gatewayIP());
    IPAddress ip = Ethernet.localIP();
    sprintf(ipBuffer, "%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);
  }
}
// IoT configuracion MQTT
void connect() {
  Serial.println(mqtt_broker);
  client.begin(mqtt_broker, net);
  Serial.println("connecting...");
  while (!client.connect("RobotJ1")) {
    Serial.print(".");
    delay(1000);
  }
  Serial.println(F("\n¡Conectado exitosamente!"));
  String ID = "{\"Jugador\":" + jugador + ",\"IP\":" + ipBuffer + "}";
  client.publish("G408/control", ID );
}

void enviarDatos() {
  if (client.connected()) {
    // JSON válido
    String json =
        "{\"Jugador\":" + jugador + ",\"Puntaje\":" + cont + "}";
    if (client.publish(TopicoSalida, json)) {
      Serial.println(F("Datos MQTT enviados con éxito:"));
      Serial.println(json);
    } else {
      Serial.println(F("Error al enviar mensaje MQTT."));
    }
  }
}


void setup() {
  Serial.begin(9600);  
  ConectarRed();
  connect();

  pinMode(Boton, INPUT);

  int lectura = digitalRead(pinSensor);
  // sensor
  if (lectura == LOW) {
  }
  // Servos
  base.attach(servBASE);
  brazo1.attach(servBE);
  brazo2.attach(servBA);
  // Posición inicial
  base.write(87);   // base
  brazo1.write(87); // brazo escudo
  brazo2.write(90); // Brazo ataque
  delay(1000);
}
void loop() {
  // stick
  EstadoBoton = digitalRead(Boton);
  int valorX = analogRead(pinX);
  int valorY = analogRead(pinY);
  valorX = map(valorX, 0, 1023, 0, 180); // Base
  valorY = map(valorY, 0, 1023, 0, 180); // Brazo Escudo
  Serial.print(" X:");
  Serial.print(valorX);
  Serial.print(" Y:");
  Serial.println(valorY);
  //delay(200);
  // Servos
  //  Girar la base
  base.write(valorX);
  //delay(200);

  // Subir brazo ataque
  brazo2.write(valorY);
  //delay(200);

  // boton
  if (EstadoBoton == HIGH) {
    cont++;
    Serial.println(String(cont));
    enviarDatos();

  }
  delay(1000);
}

