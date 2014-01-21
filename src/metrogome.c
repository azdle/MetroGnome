#include <pebble.h>

enum {
    FATAL_ERROR_MESSAGE = 0,
    GET_NEAREST_STOPS = 1,
    LIST_NEAREST_STOPS = 2,
    GET_STOP_TIMES = 3,
    LIST_DEPARTURE_TIMES = 4
  };

static Window *window;
static TextLayer *text_layer;

static void log_msg_error(AppMessageResult ret){
  if(ret == APP_MSG_OK){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Sent");
  }else if(ret == APP_MSG_SEND_TIMEOUT ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Timeout");
  }else if(ret == APP_MSG_SEND_REJECTED ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Rejected");
  }else if(ret == APP_MSG_NOT_CONNECTED ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send App Not Connected");
  }else if(ret == APP_MSG_APP_NOT_RUNNING ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send App Not Running");
  }else if(ret == APP_MSG_INVALID_ARGS ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Invalid Args");
  }else if(ret == APP_MSG_BUSY ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Busy");
  }else if(ret == APP_MSG_BUFFER_OVERFLOW ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Buffer Overflow");
  }else if(ret == APP_MSG_ALREADY_RELEASED ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Already Released");
  }else if(ret == APP_MSG_CALLBACK_ALREADY_REGISTERED ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Already Registered");
  }else if(ret == APP_MSG_CALLBACK_NOT_REGISTERED ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Not Registered");
  }else if(ret == APP_MSG_OUT_OF_MEMORY ){
    APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Out of Memory");
  }else{
    APP_LOG(APP_LOG_LEVEL_INFO, "Unknown Message Status: %u", ret);
  }
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  uint ret;
  APP_LOG(APP_LOG_LEVEL_INFO, "Button Pressed");
  text_layer_set_text(text_layer, "Requesting Refresh...");

  DictionaryIterator *iter;
  app_message_outbox_begin(&iter);

  Tuplet value = TupletInteger(1, 42);
  dict_write_tuplet(iter, &value);

  ret = app_message_outbox_send();
  log_msg_error(ret);

}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
}


static void out_failed_handler(DictionaryIterator *failed, AppMessageResult reason, void *context) {
  text_layer_set_text(text_layer, "Couldn't Send Refresh");
  log_msg_error(reason);
}

static void out_sent_handler(DictionaryIterator *sent, void *context) {
  text_layer_set_text(text_layer, "Refreshing...");
}


static void in_received_handler(DictionaryIterator *received, void *context) {
  // Check for fields you expect to receive
  Tuple* message_tuple = dict_read_first(received);

  while (message_tuple) {
    switch (message_tuple->key) {
      case FATAL_ERROR_MESSAGE:
        text_layer_set_text(text_layer, message_tuple->value->cstring);
        break;
      case  LIST_DEPARTURE_TIMES:
        text_layer_set_text(text_layer, message_tuple->value->cstring);
        break;
      case  LIST_NEAREST_STOPS:
        text_layer_set_text(text_layer, message_tuple->value->cstring);
        break;
      default:
        APP_LOG(APP_LOG_LEVEL_INFO, "Unknown Message Type");
    }
  message_tuple = dict_read_next(received);
  }
}


static void in_dropped_handler(AppMessageResult reason, void *context) {
  text_layer_set_text(text_layer, "Couldn't Receive Refresh");
  log_msg_error(reason);
 }



static void window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  text_layer = text_layer_create((GRect) { .origin = { 0, 72 }, .size = { bounds.size.w, 20 } });
  text_layer_set_text(text_layer, "Press Select to Refresh");
  text_layer_set_text_alignment(text_layer, GTextAlignmentCenter);
  layer_add_child(window_layer, text_layer_get_layer(text_layer));
}

static void window_unload(Window *window) {
  text_layer_destroy(text_layer);
}

static void init(void) {
  window = window_create();
  window_set_click_config_provider(window, click_config_provider);
  window_set_window_handlers(window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  const bool animated = true;
  window_stack_push(window, animated);

  const uint32_t inbound_size = app_message_inbox_size_maximum();
  const uint32_t outbound_size = app_message_outbox_size_maximum();

  app_message_register_inbox_received(in_received_handler);
  app_message_register_inbox_dropped(in_dropped_handler);
  app_message_register_outbox_sent(out_sent_handler);
  app_message_register_outbox_failed(out_failed_handler);

  app_message_open(inbound_size, outbound_size);
}

static void deinit(void) {
  window_destroy(window);
}

int main(void) {
  init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p", window);

  app_event_loop();
  deinit();
}
